#include "math_engine.h"

#include <cassert>
#include <cmath>
#include <cstring>

void assert_value(const char* expression, double expected) {
    const MathResult result = evaluate_expression(expression);
    assert(result.error_code == 0);
    assert(std::fabs(result.value - expected) < 1e-9);
}

void assert_error(const char* expression, const char* message) {
    const MathResult result = evaluate_expression(expression);
    assert(result.error_code != 0);
    assert(std::strcmp(result.error_message, message) == 0);
}

int main() {
    assert_value("2 + 3 * 4", 14.0);
    assert_value("(2 + 3) * 4", 20.0);
    assert_value("3^(2-6)", 1.0 / 81.0);
    assert_value("2^3^2", 512.0);
    assert_value("-3^2", -9.0);
    assert_value("(-3)^2", 9.0);
    assert_value("0.5 + .25", 0.75);
    assert_value("sqrt(16)", 4.0);
    assert_value("root(3)(27)", 3.0);
    assert_value("root(3)(-8)", -2.0);

    assert_error("1 / 0", "Cannot divide by zero");
    assert_error("sqrt(-1)", "Cannot take the square root of a negative value");
    assert_error("root(0)(8)", "Root index must be a positive integer");
    assert_error("root(2.5)(8)", "Root index must be a positive integer");
    assert_error("root(2)(-8)", "Even roots cannot contain a negative value");
    assert_error("(2 + 3", "Missing closing parenthesis");
    assert_error("", "Enter an expression");
    assert_error("1e309", "The number is not finite");
    assert_error("2 +", "Expected a number");

    return 0;
}
