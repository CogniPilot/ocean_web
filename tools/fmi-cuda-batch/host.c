// The host and device must be compiled from the same generated ModelInstance.
#include "model.h"

size_t host_instance_size(void) { return sizeof(ModelInstance); }

// Event iteration can hold an eight-slot relation history and one restore image.
// Budget twice that storage and round up for CUDA device-heap allocation overhead.
size_t host_event_heap_budget(void) {
    size_t history = 9 * ((size_t)Y_LEN + P_LEN) * sizeof(double);
    const size_t page = 64 * 1024;
    return history ? ((2 * history + page - 1) / page) * page : page;
}

void *host_begin(const char *token) {
    void *instance = fmi3InstantiateCoSimulation("lane", token, NULL, false, false,
        false, false, NULL, 0, NULL, NULL, NULL);
    if (!instance) return NULL;
    if (fmi3EnterInitializationMode(instance, false, 0, 0, false, 0) > fmi3Warning) {
        fmi3FreeInstance(instance);
        return NULL;
    }
    return instance;
}
void host_free(void *instance) { fmi3FreeInstance(instance); }
int host_finish(void *instance) { return fmi3ExitInitializationMode(instance); }
int host_real(void *instance, uint32_t ref, double *values, size_t count, int write) {
    return write ? fmi3SetFloat64(instance, &ref, 1, values, count)
                 : fmi3GetFloat64(instance, &ref, 1, values, count);
}
int host_boolean(void *instance, uint32_t ref, bool *values, size_t count, int write) {
    return write ? fmi3SetBoolean(instance, &ref, 1, values, count)
                 : fmi3GetBoolean(instance, &ref, 1, values, count);
}
