// The host and device must be compiled from the same generated ModelInstance.
#include "model.h"
#ifdef RMC_BATCH_OUTPUT_CLASSIFICATION
#include "output-references.h"
#endif

size_t host_instance_size(void) { return sizeof(ModelInstance); }

bool host_ordinary_output(uint32_t ref) {
#if defined(RMC_OUTPUT_INVENTORY_KNOWN) && RMC_OUTPUT_INVENTORY_KNOWN
    for (size_t i = 0; i < sizeof(rmc_special_output_refs) / sizeof(*rmc_special_output_refs); ++i)
        if (ref == rmc_special_output_refs[i]) return false;
    return true;
#else
    (void)ref;
    return false;
#endif
}

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
int host_set_real(void *instance, uint32_t ref, const double *values, size_t count) {
    return fmi3SetFloat64(instance, &ref, 1, values, count);
}
int host_set_boolean(void *instance, uint32_t ref, const bool *values, size_t count) {
    return fmi3SetBoolean(instance, &ref, 1, values, count);
}
int host_get_reals(void *instance, const uint32_t *refs, size_t nrefs, double *values, size_t count) {
    return fmi3GetFloat64(instance, refs, nrefs, values, count);
}
int host_get_booleans(void *instance, const uint32_t *refs, size_t nrefs, bool *values, size_t count) {
    return fmi3GetBoolean(instance, refs, nrefs, values, count);
}
