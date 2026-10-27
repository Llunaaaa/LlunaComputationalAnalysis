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

void assert_exact(const char* expression, const char* expected) {
    const MathResult result = evaluate_expression(expression);
    assert(result.error_code == 0);
    assert(std::strcmp(result.exact_value, expected) == 0);
}

void assert_approximate(const char* expression, int expected_approx) {
    const MathResult result = evaluate_expression(expression);
    assert(result.error_code == 0);
    assert(result.is_approximate == expected_approx);
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
    assert_value("5!", 120.0);
    assert_value("0!", 1.0);
    assert_value("1!", 1.0);
    assert_value("log(100)", 2.0);
    assert_value("log(2)(8)", 3.0);
    assert_value("ln(e)", 1.0);
    assert_value("pi", 4.0 * std::atan(1.0));
    assert_value("π", 4.0 * std::atan(1.0));
    assert_value("e", std::exp(1.0));
    assert_exact("pi", "π");
    assert_exact("π", "π");
    assert_exact("e", "e");
    assert_exact("sqrt(2)", "sqrt(2)");
    assert_exact("log(2)", "log(2)");

    assert_approximate("sqrt(2)", 1);
    assert_approximate("sqrt(16)", 0);
    assert_approximate("pi", 1);
    assert_approximate("e", 1);
    assert_approximate("5!", 0);
    assert_approximate("2 + 3 * 4", 0);
    assert_approximate("log(2)(3)", 1);
    assert_approximate("log(2)(8)", 0);

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
