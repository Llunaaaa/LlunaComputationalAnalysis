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

void assert_display_prefix(const char* expression, const char* prefix) {
    const MathResult result = evaluate_expression(expression);
    assert(result.error_code == 0);
    assert(std::strncmp(result.display_value, prefix, std::strlen(prefix)) == 0);
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
    assert_display_prefix("170!", "7.257415");
    assert_display_prefix("171!", "1.241018");
    assert_display_prefix("200!", "7.886578");
    assert_display_prefix("1000!", "4.023872");
    assert_display_prefix("100000!", "2.824229");
    assert_approximate("100000!", 1);
    assert_display_prefix("100001!", "2.824257");
    assert_approximate("100001!", 1);
    assert_display_prefix("1000000!", "8.26393");
    assert_approximate("1000000!", 1);
    assert_display_prefix("1000001!", "8.2639");
    assert_approximate("1000001!", 1);
    assert_error("9^(100000!)", "Operation requires an unreasonable amount of computational power");
    assert_error("(100000!)!", "Operation requires an unreasonable amount of computational power");
    assert_display_prefix("9.5!", "1133278");
    assert_approximate("9.5!", 1);
    assert_display_prefix("(-0.5)!", "1.77245");
    assert_approximate("(-0.5)!", 1);
    assert_display_prefix("(-(1/2))!", "1.77245");
    assert_approximate("(-(1/2))!", 1);
    assert_value("-9!", -362880.0);
    assert_error("(-9)!", "Factorial is undefined for negative integers");
    assert_error("(-3)!", "Factorial is undefined for negative integers");
    assert_error("(-1)!", "Factorial is undefined for negative integers");
    assert_value("2sqrt(2)", 2.0 * std::sqrt(2.0));
    assert_display_prefix("10sqrt(2)", "14.1421");
    assert_display_prefix("5pi", "15.7079");
    assert_display_prefix("10^15", "1000000000000000");
    assert_display_prefix("10^17", "1e+17");
    assert_value("2pi", 2.0 * (4.0 * std::atan(1.0)));
    assert_value("2(3+4)", 14.0);
    assert_value("(2)(3)", 6.0);
    assert_value("3e", 3.0 * std::exp(1.0));
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

    // Symbolic cancellation tests
    assert_value("pi / pi", 1.0);
    assert_approximate("pi / pi", 0);
    assert_value("2pi / pi", 2.0);
    assert_approximate("2pi / pi", 0);
    assert_value("pi - pi", 0.0);
    assert_approximate("pi - pi", 0);
    assert_value("(1 / pi) * pi", 1.0);
    assert_approximate("(1 / pi) * pi", 0);
    assert_value("e / e", 1.0);
    assert_approximate("e / e", 0);
    assert_value("e - e", 0.0);
    assert_approximate("e - e", 0);
    assert_value("ln(e)", 1.0);
    assert_approximate("ln(e)", 0);
    assert_value("sqrt(2) * sqrt(2)", 2.0);
    assert_approximate("sqrt(2) * sqrt(2)", 0);
    assert_value("sqrt(2) / sqrt(2)", 1.0);
    assert_approximate("sqrt(2) / sqrt(2)", 0);
    assert_value("(1 / sqrt(2)) * sqrt(2)", 1.0);
    assert_approximate("(1 / sqrt(2)) * sqrt(2)", 0);
    assert_value("2sqrt(2) / sqrt(2)", 2.0);
    assert_approximate("2sqrt(2) / sqrt(2)", 0);

    // General radical integer powers (Fallacy 1 resolution)
    assert_value("(sqrt(2))^2", 2.0);
    assert_approximate("(sqrt(2))^2", 0);
    assert_value("(sqrt(2))^4", 4.0);
    assert_approximate("(sqrt(2))^4", 0);
    assert_value("(2sqrt(2))^2", 8.0);
    assert_approximate("(2sqrt(2))^2", 0);
    assert_value("(2sqrt(2))^4", 64.0);
    assert_approximate("(2sqrt(2))^4", 0);

    // Reciprocal integer logarithms (Fallacy 5 resolution)
    assert_value("log(2)(1/8)", -3.0);
    assert_approximate("log(2)(1/8)", 0);
    assert_value("log(1/2)(8)", -3.0);
    assert_approximate("log(1/2)(8)", 0);
    assert_value("log(1/2)(1/8)", 3.0);
    assert_approximate("log(1/2)(1/8)", 0);

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
