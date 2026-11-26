#include <cuda.h>
#include <algorithm>
#include <charconv>
#include <cjson/cJSON.h>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <limits>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

extern "C" {
size_t host_instance_size();
size_t host_event_heap_budget();
void *host_begin(const char *);
void host_free(void *);
int host_finish(void *);
int host_real(void *, uint32_t, double *, size_t, int);
int host_boolean(void *, uint32_t, bool *, size_t, int);
}

using Json = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;
using Clock = std::chrono::steady_clock;
using Error = std::runtime_error;
static Json json(cJSON *value) { return Json(value, cJSON_Delete); }
static void require(bool ok, const std::string &message) { if (!ok) throw Error(message); }
static size_t deviceStackBytes() {
    const char *value = std::getenv("RUMOCA_CUDA_STACK_BYTES");
    if (!value) return 24576;
    size_t bytes{};
    const char *end = value + std::strlen(value);
    const auto parsed = std::from_chars(value, end, bytes);
    require(parsed.ec == std::errc{} && parsed.ptr == end && bytes > 0,
            "RUMOCA_CUDA_STACK_BYTES must be a positive byte count");
    return bytes;
}
static void driver(CUresult result, const char *op) {
    if (result == CUDA_SUCCESS) return;
    const char *why = nullptr;
    cuGetErrorString(result, &why);
    throw Error(std::string(op) + ": " + (why ? why : std::to_string(result)));
}
#define GPU(call) driver((call), #call)
static const cJSON *field(const cJSON *obj, const char *name) {
    return cJSON_GetObjectItemCaseSensitive(obj, name);
}
static const char *string(const cJSON *value) {
    require(cJSON_IsString(value), "Expected string");
    return value->valuestring;
}
static void fmi(int status, const std::string &name) {
    require(status <= 1, "FMI status " + std::to_string(status) + " for " + name);
}
struct Variable { uint32_t ref; int count; std::string type; };
struct Metadata {
    std::string token;
    std::map<std::string,Variable> variables;
    explicit Metadata(const char *path) {
        std::ifstream in(path);
        require(in.good(), "Cannot read FMI metadata");
        std::string raw((std::istreambuf_iterator<char>(in)), {});
        auto data = json(cJSON_Parse(raw.c_str()));
        token = string(field(data.get(), "token"));
        const cJSON *item;
        cJSON_ArrayForEach(item, field(data.get(), "variables")) {
            const cJSON *ref = cJSON_GetArrayItem(item, 0), *count = cJSON_GetArrayItem(item, 2);
            require(cJSON_IsNumber(ref) && cJSON_IsNumber(count) && count->valueint > 0, "Bad FMI metadata");
            variables.emplace(item->string, Variable{static_cast<uint32_t>(ref->valuedouble),
                count->valueint, string(cJSON_GetArrayItem(item, 1))});
        }
    }
    const Variable &lookup(const std::string &name) const {
        auto found = variables.find(name);
        require(found != variables.end(), "Unknown FMI variable " + name);
        return found->second;
    }
};
class Batch {
    const Metadata &meta;
    CUcontext context{};
    CUmodule module{};
    CUfunction kernel{};
    CUevent kernelBegin{}, kernelEnd{};
    double kernelSeconds{};
    CUdeviceptr instances{}, status{}, scratch{};
    std::vector<unsigned char> host;
    std::vector<int> results;
    const size_t instanceBytes = host_instance_size();
    const size_t heapPerLane = host_event_heap_budget();
    size_t heapBytes{};
    const uint64_t stride = 4ULL << 20;
    int count{};
    double time{};
    uint64_t dispatches{};
    char device[256]{};
    size_t freeBytes{}, totalBytes{};
    int gridLimit{};
    void release() {
        if (instances) cuMemFree(instances);
        if (status) cuMemFree(status);
        if (scratch) cuMemFree(scratch);
        instances = status = scratch = 0;
        count = 0;
        host.clear();
        results.clear();
    }
    void refreshCapacity() { GPU(cuMemGetInfo(&freeBytes,&totalBytes)); }
    size_t perLane() const { return instanceBytes + stride + sizeof(int); }
    size_t maxLanes() const {
        // Leave working space for the context, driver lazy allocation and other GL clients.
        const size_t reserve = std::min<size_t>(freeBytes / 4, 256ULL << 20);
        return std::min({static_cast<size_t>(gridLimit),heapBytes / heapPerLane,(freeBytes - reserve) / perLane()});
    }
    void bindGlobal(const char *name, const void *value, size_t size) {
        CUdeviceptr ptr; size_t len;
        GPU(cuModuleGetGlobal(&ptr, &len, module, name));
        require(size == len, std::string("Wrong device ABI for ") + name);
        GPU(cuMemcpyHtoD(ptr,value,size));
    }
    void verifyModule() const {
        CUdeviceptr ptr; size_t bytes;
        CUresult result = cuModuleGetGlobal(&ptr,&bytes,module,"rmc_fmi3_token");
        if (result == CUDA_ERROR_NOT_FOUND) return;  // Older generated modules lack these exports.
        driver(result,"read GPU FMI token");
        require(bytes == meta.token.size()+1,"Unexpected GPU FMI token length");
        std::vector<char> token(bytes);
        GPU(cuMemcpyDtoH(token.data(),ptr,bytes));
        require(!std::memcmp(token.data(),meta.token.c_str(),bytes),"Device and host FMI tokens differ");
        GPU(cuModuleGetGlobal(&ptr,&bytes,module,"rmc_fmi3_instance_bytes"));
        require(bytes == sizeof(uint64_t),"Unexpected GPU instance size export");
        uint64_t size; GPU(cuMemcpyDtoH(&size,ptr,sizeof size));
        require(size == instanceBytes,"Device and host FMI instance sizes differ");
    }
    void allocate(int n) {
        release(); refreshCapacity();
        require(n > 0 && static_cast<size_t>(n) <= maxLanes(), "Batch exceeds available CUDA memory or grid size");
        host.resize(instanceBytes * n);
        results.resize(n);
        GPU(cuMemAlloc(&instances,host.size()));
        GPU(cuMemAlloc(&status,n * sizeof(int)));
        GPU(cuMemAlloc(&scratch,n * stride));
        bindGlobal("rmc_scratch",&scratch,sizeof scratch);
        bindGlobal("rmc_stride",&stride,sizeof stride);
        count = n; time = 0; dispatches = 0; kernelSeconds = 0;
    }
    void *lane(int i) { return host.data() + i * instanceBytes; }
    void write(void *instance, const cJSON *inputs) const {
        require(cJSON_IsObject(inputs), "Each lane requires an inputs object");
        const cJSON *item;
        cJSON_ArrayForEach(item,inputs) {
            const auto &v = meta.lookup(item->string);
            const bool array = cJSON_IsArray(item);
            require((array ? cJSON_GetArraySize(item) : 1) == v.count, std::string("Wrong input size for ") + item->string);
            std::vector<double> reals;
            std::unique_ptr<bool[]> flags;
            if (v.type == "Float64") reals.resize(v.count);
            else if (v.type == "Boolean") flags.reset(new bool[v.count]);
            else throw Error("Unsupported FMI type " + v.type);
            const cJSON *value = array ? item->child : item;
            for (int k = 0; k < v.count; ++k, value = value->next) {
                if (flags) {
                    require(cJSON_IsBool(value) || (cJSON_IsNumber(value) &&
                        (value->valuedouble == 0 || value->valuedouble == 1)), "Expected boolean");
                    flags[k] = cJSON_IsTrue(value) || (cJSON_IsNumber(value) && value->valuedouble == 1);
                } else {
                    require(cJSON_IsNumber(value) && std::isfinite(value->valuedouble), "Expected finite real");
                    reals[k] = value->valuedouble;
                }
            }
            fmi(flags ? host_boolean(instance,v.ref,flags.get(),v.count,1)
                      : host_real(instance,v.ref,reals.data(),v.count,1),item->string);
        }
    }
    Json read(void *instance, const char *name) const {
        const auto &v = meta.lookup(name);
        auto array = json(cJSON_CreateArray());
        std::vector<double> reals;
        std::unique_ptr<bool[]> flags;
        if (v.type == "Float64") {
            reals.resize(v.count);
            fmi(host_real(instance,v.ref,reals.data(),v.count,0),name);
        } else if (v.type == "Boolean") {
            flags.reset(new bool[v.count]);
            fmi(host_boolean(instance,v.ref,flags.get(),v.count,0),name);
        } else throw Error("Unsupported FMI type " + v.type);
        for (int k = 0; k < v.count; ++k) {
            require(flags || std::isfinite(reals[k]), std::string("Nonfinite FMI output ") + name);
            auto value = json(flags ? cJSON_CreateBool(flags[k]) : cJSON_CreateNumber(reals[k]));
            if (v.count == 1) return value;
            cJSON_AddItemToArray(array.get(),value.release());
        }
        return array;
    }
    void advance(double dt) {
        require(std::isfinite(dt) && dt > 0, "dt must be positive and finite");
        GPU(cuMemcpyHtoD(instances,host.data(),host.size()));
        // First eight bytes of each arena are its own stack cursor.
        GPU(cuMemsetD2D32(scratch,stride,0,2,count));
        void *args[] = {&instances,&time,&dt,&status,&count};
        // One independent FMI solve per block; separate schedulable lanes across SMs.
        GPU(cuEventRecord(kernelBegin,nullptr));
        GPU(cuLaunchKernel(kernel,count,1,1,1,1,1,0,nullptr,args,nullptr));
        GPU(cuEventRecord(kernelEnd,nullptr));
        GPU(cuMemcpyDtoH(results.data(),status,count * sizeof(int)));
        float elapsedMs; GPU(cuEventElapsedTime(&elapsedMs,kernelBegin,kernelEnd));
        kernelSeconds = elapsedMs / 1000.0;
        for (int i = 0; i < count; ++i) fmi(results[i],"GPU lane " + std::to_string(i));
        GPU(cuMemcpyDtoH(host.data(),instances,host.size()));
        ++dispatches; time += dt;
    }
public:
    Batch(const Metadata &meta, const char *path) : meta(meta) {
        std::unique_ptr<void,decltype(&host_free)> check(host_begin(meta.token.c_str()),host_free);
        require(bool(check),"Metadata token does not match the compiled host FMI");
        GPU(cuInit(0)); CUdevice dev; GPU(cuDeviceGet(&dev,0));
        GPU(cuDeviceGetName(device,sizeof device,dev));
        GPU(cuDeviceGetAttribute(&gridLimit,CU_DEVICE_ATTRIBUTE_MAX_GRID_DIM_X,dev));
        GPU(cuCtxCreate_v2(&context,0,dev));
        GPU(cuCtxSetLimit(CU_LIMIT_STACK_SIZE,deviceStackBytes()));
        // CUDA device malloc is independent of both driver allocations and our lane arenas.
        // Set it before loading the compiled model, while the runtime limit is mutable.
        refreshCapacity();
        size_t defaultHeap; GPU(cuCtxGetLimit(&defaultHeap,CU_LIMIT_MALLOC_HEAP_SIZE));
        const size_t possibleLanes = freeBytes / (perLane() + heapPerLane);
        GPU(cuCtxSetLimit(CU_LIMIT_MALLOC_HEAP_SIZE,std::max(defaultHeap,possibleLanes * heapPerLane)));
        GPU(cuCtxGetLimit(&heapBytes,CU_LIMIT_MALLOC_HEAP_SIZE));
        GPU(cuEventCreate(&kernelBegin,CU_EVENT_DEFAULT));
        GPU(cuEventCreate(&kernelEnd,CU_EVENT_DEFAULT));
        GPU(cuModuleLoad(&module,path));
        verifyModule();
        if (cuModuleGetFunction(&kernel,module,"rmc_fmi3_step") != CUDA_SUCCESS)
            GPU(cuModuleGetFunction(&kernel,module,"diverStep"));
        refreshCapacity();
    }
    ~Batch() {
        release();
        if (kernelBegin) cuEventDestroy(kernelBegin);
        if (kernelEnd) cuEventDestroy(kernelEnd);
        if (module) cuModuleUnload(module);
        if (context) cuCtxDestroy_v2(context);
    }
    Json capabilities() const {
        auto reply = json(cJSON_CreateObject());
        cJSON_AddBoolToObject(reply.get(),"ok",true);
        cJSON_AddStringToObject(reply.get(),"device",device);
        cJSON_AddStringToObject(reply.get(),"token",meta.token.c_str());
        cJSON_AddNumberToObject(reply.get(),"maxLanes",maxLanes());
        cJSON_AddNumberToObject(reply.get(),"bytesPerLane",perLane());
        cJSON_AddNumberToObject(reply.get(),"deviceHeapBytes",heapBytes);
        cJSON_AddNumberToObject(reply.get(),"deviceHeapBytesPerLane",heapPerLane);
        cJSON_AddNumberToObject(reply.get(),"freeBytes",freeBytes);
        cJSON_AddNumberToObject(reply.get(),"totalBytes",totalBytes);
        return reply;
    }
    Json run(const cJSON *request) {
        const auto started = Clock::now();
        const std::string op = string(field(request,"op"));
        const auto *rows = field(request,"lanes"), *outputs = field(request,"outputs");
        require(cJSON_IsArray(rows) && cJSON_IsArray(outputs), "Expected lanes and outputs arrays");
        const cJSON *out;
        cJSON_ArrayForEach(out,outputs) meta.lookup(string(out));
        const int n = cJSON_GetArraySize(rows);
        try {
            if (op == "reset") allocate(n);
            else require(op == "advance" && count > 0 && n == count, "Reset before advancing or changing batch size");
            int i = 0;
            const cJSON *row;
            cJSON_ArrayForEach(row,rows) {
                if (op == "reset") {
                    std::unique_ptr<void, decltype(&host_free)> temp(host_begin(meta.token.c_str()),host_free);
                    require(bool(temp),"FMI initialization or token mismatch");
                    write(temp.get(),field(row,"inputs"));
                    fmi(host_finish(temp.get()),"initialize lane " + std::to_string(i));
                    std::memcpy(lane(i),temp.get(),instanceBytes);
                } else write(lane(i),field(row,"inputs"));
                ++i;
            }
            if (op == "advance") {
                auto dt = field(request,"dt"); require(cJSON_IsNumber(dt),"Missing dt");
                advance(dt->valuedouble);
            }
            auto reply = capabilities();
            auto *values = cJSON_AddArrayToObject(reply.get(),"lanes");
            for (i = 0; i < count; ++i) {
                auto obj = json(cJSON_CreateObject());
                cJSON_ArrayForEach(out,outputs) {
                    const auto *name = string(out);
                    cJSON_AddItemToObject(obj.get(),name,read(lane(i),name).release());
                }
                cJSON_AddItemToArray(values,obj.release());
            }
            cJSON_AddNumberToObject(reply.get(),"dispatches",dispatches);
            cJSON_AddNumberToObject(reply.get(),"kernelSeconds",kernelSeconds);
            cJSON_AddNumberToObject(reply.get(),"stepSeconds",std::chrono::duration<double>(Clock::now() - started).count());
            return reply;
        } catch (...) { release(); throw; }
    }
};
static void send(const Json &reply) {
    std::unique_ptr<char,decltype(&cJSON_free)> text(cJSON_PrintUnformatted(reply.get()),cJSON_free);
    require(bool(text),"JSON serialization failed");
    std::cout << text.get() << std::endl;
}
int main(int argc,char **argv) {
    if (argc < 3) { std::cerr << "Usage: runner CUBIN FMI.json [--capabilities]\n"; return 2; }
    try {
        Metadata meta(argv[2]);
        Batch batch(meta,argv[1]);
        if (argc == 4 && std::string(argv[3]) == "--capabilities") { send(batch.capabilities()); return 0; }
        std::string line;
        while (std::getline(std::cin,line)) {
            try {
                auto request = json(cJSON_ParseWithOpts(line.c_str(),nullptr,true));
                require(cJSON_IsObject(request.get()),"Invalid JSON request");
                send(batch.run(request.get()));
            } catch (const std::exception &error) {
                auto reply = json(cJSON_CreateObject());
                cJSON_AddBoolToObject(reply.get(),"ok",false);
                cJSON_AddStringToObject(reply.get(),"error",error.what()); send(reply);
            }
        }
    } catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
}
