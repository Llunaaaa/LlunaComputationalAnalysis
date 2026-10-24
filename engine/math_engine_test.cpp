#include "math_engine.h"

#include <cassert>
#include <cmath>
#include <cstring>

int main() {
    const MathResult arithmetic = evaluate_expression("2 * (3 + 4)");
    assert(arithmetic.error_code == 0);
    assert(std::fabs(arithmetic.value - 14.0) < 1e-9);

    const MathResult division_error = evaluate_expression("1 / 0");
    assert(division_error.error_code != 0);
    assert(std::strcmp(division_error.error_message, "Cannot divide by zero") == 0);

    return 0;
}
