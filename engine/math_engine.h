#pragma once

#ifdef __cplusplus
extern "C" {
#endif

typedef struct MathResult {
    int error_code;
    double value;
    char error_message[256];
} MathResult;

MathResult evaluate_expression(const char* expression);

#ifdef __cplusplus
}
#endif
