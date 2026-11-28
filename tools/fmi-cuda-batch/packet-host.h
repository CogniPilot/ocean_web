#pragma once

#if __has_include("rmc_cuda_packet.h")
#include "rmc_cuda_packet.h"
#else
// The versioned CUDA entry also supports older FMU archives. Those archives
// predate the shared header even when built with the current CUDA compiler.
struct RmcFmi3PacketRun {
    uint32_t first_ref, ref_count, first_value, value_count, logical;
};
struct RmcFmi3PacketLane {
    uint32_t input_start, input_count, output_start, output_count;
};
#endif

static_assert(sizeof(bool) == sizeof(unsigned char));
static_assert(sizeof(RmcFmi3PacketRun) == 5 * sizeof(uint32_t));
static_assert(sizeof(RmcFmi3PacketLane) == 4 * sizeof(uint32_t));

class DevicePacketBuffer {
    size_t capacity{};
public:
    CUdeviceptr pointer{};

    void clear() {
        if (pointer) cuMemFree(pointer);
        pointer = 0;
        capacity = 0;
    }

    template<class T>
    void upload(const std::vector<T>& values) {
        if (values.empty()) return;
        const size_t bytes = values.size() * sizeof(T);
        if (capacity < bytes) {
            clear();
            GPU(cuMemAlloc(&pointer, bytes));
            capacity = bytes;
        }
        GPU(cuMemcpyHtoD(pointer, values.data(), bytes));
    }

    template<class T>
    void download(std::vector<T>& values) const {
        if (!values.empty()) GPU(cuMemcpyDtoH(values.data(), pointer, values.size() * sizeof(T)));
    }
};

struct Packet {
    std::vector<RmcFmi3PacketLane> lanes;
    std::vector<RmcFmi3PacketRun> runs;
    std::vector<uint32_t> refs;
    std::vector<double> reals;
    std::vector<unsigned char> flags;
    DevicePacketBuffer deviceLanes, deviceRuns, deviceRefs, deviceReals, deviceFlags;

    void begin() {
        lanes.clear();
        runs.clear();
        refs.clear();
        reals.clear();
        flags.clear();
    }

    void release() {
        deviceLanes.clear();
        deviceRuns.clear();
        deviceRefs.clear();
        deviceReals.clear();
        deviceFlags.clear();
    }

    static uint32_t index(size_t size) {
        require(size <= UINT32_MAX, "FMI transfer exceeds packet limit");
        return static_cast<uint32_t>(size);
    }

    void append(bool logical, const uint32_t *references, size_t refCount, size_t count) {
        const size_t firstValue = logical ? flags.size() : reals.size();
        index(refs.size() + refCount);
        index(firstValue + count);
        runs.push_back({index(refs.size()), index(refCount), index(firstValue), index(count), logical});
        refs.insert(refs.end(), references, references + refCount);
        if (logical) flags.resize(firstValue + count);
        else reals.resize(firstValue + count);
    }

    void input(uint32_t ref, size_t count, const double *values, const bool *booleans) {
        append(booleans != nullptr, &ref, 1, count);
        const auto first = runs.back().first_value;
        if (booleans) std::copy_n(booleans, count, flags.begin() + first);
        else std::copy_n(values, count, reals.begin() + first);
    }

    void upload() {
        deviceLanes.upload(lanes);
        deviceRuns.upload(runs);
        deviceRefs.upload(refs);
        deviceReals.upload(reals);
        deviceFlags.upload(flags);
    }

    void download() {
        deviceReals.download(reals);
        deviceFlags.download(flags);
    }
};
