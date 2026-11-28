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
#include <type_traits>
#include <vector>

extern "C" {
size_t host_instance_size();
size_t host_event_heap_budget();
void *host_begin(const char *);
void host_free(void *);
int host_finish(void *);
int host_set_real(void *, uint32_t, const double *, size_t);
int host_set_boolean(void *, uint32_t, const bool *, size_t);
int host_get_reals(void *, const uint32_t *, size_t, double *, size_t);
int host_get_booleans(void *, const uint32_t *, size_t, bool *, size_t);
bool host_ordinary_output(uint32_t);
}

using Json = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;
using Clock = std::chrono::steady_clock;
using Error = std::runtime_error;
static Json json(cJSON *value) { return Json(value, cJSON_Delete); }
static void require(bool ok, const std::string &message) { if (!ok) throw Error(message); }
static std::string encode_json(const Json &value) {
    std::unique_ptr<char, decltype(&cJSON_free)> text(cJSON_PrintUnformatted(value.get()), cJSON_free);
    if (!text) throw Error("JSON serialization failed");
    return std::string(text.get());
}
static size_t memorySetting(const char *name, size_t fallback) {
    const char *value = std::getenv(name);
    if (!value) return fallback;
    size_t bytes{};
    const char *end = value + std::strlen(value);
    const auto parsed = std::from_chars(value, end, bytes);
    require(parsed.ec == std::errc{} && parsed.ptr == end && bytes > 0,
            std::string(name) + " must be a positive byte count");
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
#include "packet-host.h"

class OutputReader {
    struct Field { const char* name; std::string key; size_t count; };
    struct Run {
        bool logical, ordinary;
        std::vector<uint32_t> refs;
        std::vector<Field> fields;
        size_t count = 0;
    };
    std::vector<Run> runs;
    std::vector<double> reals;
    std::unique_ptr<bool[]> flags;

    static void append_real(std::string &out, double value, const char* name) {
        if (!std::isfinite(value)) throw Error(std::string("Nonfinite FMI output ") + name);
        char text[64];
        const auto result = std::to_chars(text, text + sizeof(text), value);
        if (result.ec != std::errc()) throw Error(std::string("Cannot format FMI output ") + name);
        out.append(text, result.ptr);
    }
public:
    OutputReader(const Metadata& meta, const cJSON* outputs) {
        const cJSON* output;
        cJSON_ArrayForEach(output, outputs) {
            const char* name = string(output);
            const auto& var = meta.lookup(name);
            const bool logical = var.type == "Boolean";
            if (!logical && var.type != "Float64") throw Error("Unsupported FMI type " + var.type);
            const bool ordinary = host_ordinary_output(var.ref);
            if (!ordinary || runs.empty() || !runs.back().ordinary || runs.back().logical != logical)
                runs.push_back({logical, ordinary, {}, {}, 0});
            auto& run = runs.back();
            const auto count = static_cast<size_t>(var.count);
            run.refs.push_back(var.ref);
            run.fields.push_back({name, encode_json(json(cJSON_CreateString(name))), count});
            run.count += count;
        }
        size_t max_flags = 0, max_reals = 0;
        for (const auto& run : runs) {
            auto& maximum = run.logical ? max_flags : max_reals;
            maximum = std::max(maximum, run.count);
        }
        reals.resize(max_reals);
        if (max_flags) flags.reset(new bool[max_flags]);
    }

    void plan(Packet& packet) const {
        for (const auto& run : runs)
            packet.append(run.logical,run.refs.data(),run.refs.size(),run.count);
    }
    void read_packet(std::string &out, const Packet& packet, const RmcFmi3PacketLane& lane) const {
        out.push_back('{');
        for (size_t k=0; k<runs.size(); ++k) {
            const auto& run = runs[k];
            const auto first = packet.runs[lane.output_start+k].first_value;
            if (run.logical) append_run(out, run, packet.flags.data() + first);
            else append_run(out, run, packet.reals.data() + first);
        }
        out.push_back('}');
    }
    void read(std::string &out, void* instance) {
        out.push_back('{');
        for (const auto& run : runs) {
            const int status = run.logical
                ? host_get_booleans(instance, run.refs.data(), run.refs.size(), flags.get(), run.count)
                : host_get_reals(instance, run.refs.data(), run.refs.size(), reals.data(), run.count);
            fmi(status, run.fields.front().name);
            if (run.logical) append_run(out, run, flags.get());
            else append_run(out, run, reals.data());
        }
        out.push_back('}');
    }
private:
    template<class Value>
    static void append_run(std::string &out, const Run& run, const Value *values) {
        size_t index = 0;
        for (const auto& field : run.fields) {
            if (out.back() != '{') out.push_back(',');
            out.append(field.key);
            out.push_back(':');
            if (field.count > 1) out.push_back('[');
            for (size_t k=0; k<field.count; ++k, ++index) {
                if (k) out.push_back(',');
                if constexpr (std::is_same_v<Value, double>) append_real(out, values[index], field.name);
                else out.append(values[index] ? "true" : "false");
            }
            if (field.count > 1) out.push_back(']');
        }
    }
};
class Batch {
    const Metadata &meta;
    CUcontext context{};
    CUmodule module{};
    CUfunction kernel{};
    unsigned threadsPerBlock = 1;
    CUevent kernelBegin{}, kernelEnd{};
    double kernelSeconds{};
    bool resident = false;
    Packet packet;
    CUdeviceptr instances{}, status{}, scratch{};
    std::vector<unsigned char> host;
    std::vector<int> results;
    std::string response;
    const size_t instanceBytes = host_instance_size();
    const size_t heapPerLane = host_event_heap_budget();
    size_t heapBytes{};
    const uint64_t stride = memorySetting("RUMOCA_CUDA_ARENA_BYTES", 4ULL << 20);
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
        packet.release();
        host.clear();
        results.clear();
    }
    void refreshCapacity() { GPU(cuMemGetInfo(&freeBytes,&totalBytes)); }
    size_t perLane() const { return instanceBytes + stride + sizeof(int); }
    size_t allocatableBytes() const {
        // Leave working space for the context, driver lazy allocation and other GL clients.
        const size_t reserve = std::min<size_t>(freeBytes / 4, 256ULL << 20);
        return freeBytes - reserve;
    }
    size_t maxLanes() const {
        return std::min({static_cast<size_t>(gridLimit),heapBytes / heapPerLane,allocatableBytes() / perLane()});
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
    void write(void *instance, const cJSON *inputs, Packet *target = nullptr) const {
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
            if (target) target->input(v.ref,v.count,reals.data(),flags.get());
            else fmi(flags ? host_set_boolean(instance,v.ref,flags.get(),v.count)
                           : host_set_real(instance,v.ref,reals.data(),v.count),item->string);
        }
    }
    void advance(double dt) {
        require(std::isfinite(dt) && dt > 0, "dt must be positive and finite");
        if (!resident || !dispatches) {
            GPU(cuMemcpyHtoD(instances,host.data(),host.size()));
            if (resident) std::vector<unsigned char>().swap(host);
        }
        if (resident) packet.upload();
        // First eight bytes of each arena are its own stack cursor.
        GPU(cuMemsetD2D32(scratch,stride,0,2,count));
        void *args[] = {&instances,&time,&dt,&status,&count,&packet.deviceLanes.pointer,&packet.deviceRuns.pointer,
                        &packet.deviceRefs.pointer,&packet.deviceReals.pointer,&packet.deviceFlags.pointer};
        // One independent FMI solve per block; separate schedulable lanes across SMs.
        GPU(cuEventRecord(kernelBegin,nullptr));
        GPU(cuLaunchKernel(kernel,count,1,1,threadsPerBlock,1,1,0,nullptr,args,nullptr));
        GPU(cuEventRecord(kernelEnd,nullptr));
        GPU(cuMemcpyDtoH(results.data(),status,count * sizeof(int)));
        float elapsedMs; GPU(cuEventElapsedTime(&elapsedMs,kernelBegin,kernelEnd));
        kernelSeconds = elapsedMs / 1000.0;
        for (int i = 0; i < count; ++i) fmi(results[i],"GPU lane " + std::to_string(i));
        if (resident) packet.download();
        else GPU(cuMemcpyDtoH(host.data(),instances,host.size()));
        ++dispatches; time += dt;
    }
public:
    Batch(const Metadata &meta, const char *path) : meta(meta) {
        require(stride % 256 == 0 && stride <= std::numeric_limits<size_t>::max() - instanceBytes - sizeof(int) - heapPerLane,
                "CUDA lane arena must be a multiple of 256 bytes and fit in device memory");
        std::unique_ptr<void,decltype(&host_free)> check(host_begin(meta.token.c_str()),host_free);
        require(bool(check),"Metadata token does not match the compiled host FMI");
        GPU(cuInit(0)); CUdevice dev; GPU(cuDeviceGet(&dev,0));
        GPU(cuDeviceGetName(device,sizeof device,dev));
        GPU(cuDeviceGetAttribute(&gridLimit,CU_DEVICE_ATTRIBUTE_MAX_GRID_DIM_X,dev));
        GPU(cuCtxCreate_v2(&context,0,dev));
        GPU(cuCtxSetLimit(CU_LIMIT_STACK_SIZE,memorySetting("RUMOCA_CUDA_STACK_BYTES", 24576)));
        // CUDA device malloc is independent of both driver allocations and our lane arenas.
        // Set it before loading the compiled model, while the runtime limit is mutable.
        refreshCapacity();
        size_t defaultHeap; GPU(cuCtxGetLimit(&defaultHeap,CU_LIMIT_MALLOC_HEAP_SIZE));
        const size_t possibleLanes = allocatableBytes() / (perLane() + heapPerLane);
        GPU(cuCtxSetLimit(CU_LIMIT_MALLOC_HEAP_SIZE,std::max(defaultHeap,possibleLanes * heapPerLane)));
        GPU(cuCtxGetLimit(&heapBytes,CU_LIMIT_MALLOC_HEAP_SIZE));
        GPU(cuEventCreate(&kernelBegin,CU_EVENT_DEFAULT));
        GPU(cuEventCreate(&kernelEnd,CU_EVENT_DEFAULT));
        GPU(cuModuleLoad(&module,path));
        verifyModule();
        const auto packetStep = cuModuleGetFunction(&kernel,module,"rmc_fmi3_packet_block_v1");
        if (packetStep != CUDA_SUCCESS && packetStep != CUDA_ERROR_NOT_FOUND) GPU(packetStep);
        resident = packetStep == CUDA_SUCCESS;
        const auto blockStep = resident ? CUDA_SUCCESS : cuModuleGetFunction(&kernel,module,"rmc_fmi3_step_block");
        if (blockStep == CUDA_SUCCESS) {
            threadsPerBlock = 33;
        } else {
            if (blockStep != CUDA_ERROR_NOT_FOUND) GPU(blockStep);
            if (cuModuleGetFunction(&kernel,module,"rmc_fmi3_step") != CUDA_SUCCESS)
                GPU(cuModuleGetFunction(&kernel,module,"diverStep"));
        }
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
    const std::string& run(const cJSON *request) {
        const auto started = Clock::now();
        const std::string op = string(field(request,"op"));
        const auto *rows = field(request,"lanes"), *outputs = field(request,"outputs");
        require(cJSON_IsArray(rows) && cJSON_IsArray(outputs), "Expected lanes and outputs arrays");
        OutputReader reader(meta, outputs);
        const int n = cJSON_GetArraySize(rows);
        try {
            if (op == "reset") allocate(n);
            else require(op == "advance" && count > 0 && n == count, "Reset before advancing or changing batch size");
            const bool packetStep = resident && op == "advance";
            if (packetStep) packet.begin();
            int i = 0;
            const cJSON *row;
            cJSON_ArrayForEach(row,rows) {
                if (op == "reset") {
                    std::unique_ptr<void, decltype(&host_free)> temp(host_begin(meta.token.c_str()),host_free);
                    require(bool(temp),"FMI initialization or token mismatch");
                    write(temp.get(),field(row,"inputs"));
                    fmi(host_finish(temp.get()),"initialize lane " + std::to_string(i));
                    std::memcpy(lane(i),temp.get(),instanceBytes);
                } else if (packetStep) {
                    const uint32_t start = Packet::index(packet.runs.size());
                    write(nullptr,field(row,"inputs"),&packet);
                    const uint32_t outputStart = Packet::index(packet.runs.size());
                    reader.plan(packet);
                    packet.lanes.push_back({start,outputStart-start,outputStart,Packet::index(packet.runs.size())-outputStart});
                } else write(lane(i),field(row,"inputs"));
                ++i;
            }
            if (op == "advance") {
                auto dt = field(request,"dt"); require(cJSON_IsNumber(dt),"Missing dt");
                advance(dt->valuedouble);
            }
            // Finish encoding before writing to stdout. Invalid observations
            // must produce a single error line rather than a partial reply.
            response.assign("{\"lanes\":[");
            for (i = 0; i < count; ++i) {
                if (i) response.push_back(',');
                if (packetStep) reader.read_packet(response, packet, packet.lanes[i]);
                else reader.read(response, lane(i));
            }
            auto reply = capabilities();
            cJSON_AddNumberToObject(reply.get(),"dispatches",dispatches);
            cJSON_AddNumberToObject(reply.get(),"kernelSeconds",kernelSeconds);
            cJSON_AddNumberToObject(reply.get(),"stepSeconds",std::chrono::duration<double>(Clock::now() - started).count());
            const auto stats = encode_json(reply);
            response.append("],");
            response.append(stats, 1, std::string::npos);
            return response;
        } catch (...) { release(); throw; }
    }
};
int main(int argc,char **argv) {
    if (argc < 3) { std::cerr << "Usage: runner CUBIN FMI.json [--capabilities]\n"; return 2; }
    try {
        Metadata meta(argv[2]);
        Batch batch(meta,argv[1]);
        if (argc == 4 && std::string(argv[3]) == "--capabilities") {
            std::cout << encode_json(batch.capabilities()) << std::endl;
            return 0;
        }
        std::string line;
        while (std::getline(std::cin,line)) {
            try {
                auto request = json(cJSON_ParseWithOpts(line.c_str(),nullptr,true));
                require(cJSON_IsObject(request.get()),"Invalid JSON request");
                std::cout << batch.run(request.get()) << std::endl;
            } catch (const std::exception &error) {
                auto reply = json(cJSON_CreateObject());
                cJSON_AddBoolToObject(reply.get(),"ok",false);
                cJSON_AddStringToObject(reply.get(),"error",error.what());
                std::cout << encode_json(reply) << std::endl;
            }
        }
    } catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
}
