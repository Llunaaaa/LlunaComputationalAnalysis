#include "math_engine.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>

namespace {

int checks = 0;
int failures = 0;

bool evaluate_ok(const char* expression, MathResult& result) {
    ++checks;
    result = evaluate_expression(expression);
    if (result.error_code == 0) return true;
    ++failures;
    std::printf("FAIL %s: unexpected error \"%s\"\n", expression, result.error_message);
    return false;
}

void fail(const char* expression, const char* what, const MathResult& result) {
    ++failures;
    std::printf("FAIL %s: %s (value=%.17g display=\"%s\" exact=\"%s\" approx=%d)\n", expression, what,
                result.value, result.display_value, result.exact_value, result.is_approximate);
}

} // namespace

void assert_value(const char* expression, double expected) {
    MathResult result;
    if (evaluate_ok(expression, result) && !(std::fabs(result.value - expected) < 1e-9)) {
        fail(expression, "wrong value", result);
    }
}

void assert_relative_value(const char* expression, double expected) {
    MathResult result;
    if (evaluate_ok(expression, result) && !(std::fabs(result.value - expected) <= 1e-12 * std::fabs(expected))) {
        fail(expression, "wrong value", result);
    }
}

void assert_error(const char* expression, const char* message) {
    ++checks;
    const MathResult result = evaluate_expression(expression);
    if (result.error_code == 0) {
        fail(expression, "expected an error", result);
    } else if (std::strcmp(result.error_message, message) != 0) {
        ++failures;
        std::printf("FAIL %s: error \"%s\", expected \"%s\"\n", expression, result.error_message, message);
    }
}

void assert_exact(const char* expression, const char* expected) {
    MathResult result;
    if (evaluate_ok(expression, result) && std::strcmp(result.exact_value, expected) != 0) {
        fail(expression, (std::string("exact form should be ") + expected).c_str(), result);
    }
}

void assert_approximate(const char* expression, int expected_approx) {
    MathResult result;
    if (evaluate_ok(expression, result) && result.is_approximate != expected_approx) {
        fail(expression, expected_approx ? "should be approximate" : "should be exact", result);
    }
}

void assert_display_prefix(const char* expression, const char* prefix) {
    MathResult result;
    if (evaluate_ok(expression, result) && std::strncmp(result.display_value, prefix, std::strlen(prefix)) != 0) {
        fail(expression, (std::string("display should start with ") + prefix).c_str(), result);
    }
}

// Regressions for the engine audit: overflow fallback, exact forms, scoping,
// numerical methods and the function registry.
void run_audit_regressions() {
    const double pi = 3.14159265358979323846;
    const double e = std::exp(1.0);

    // Exact rational overflow continues in floating point instead of failing.
    assert_value("2^40", 1099511627776.0);
    assert_approximate("2^40", 0);
    assert_approximate("2^62", 0);
    assert_relative_value("2^64", std::pow(2.0, 64.0));
    assert_approximate("2^64", 1);
    assert_relative_value("(2^62)*(2^62)", std::pow(2.0, 124.0));
    assert_relative_value("9223372036854775807 + 1", 9223372036854775808.0);
    assert_relative_value("(1/3)^50", std::pow(1.0 / 3.0, 50.0));
    assert_relative_value("1/9223372036854775807 + 1/9223372036854775806", 2.0 / 9223372036854775806.5);
    assert_approximate("1/9223372036854775807 + 1/9223372036854775806", 1);
    assert_exact("1/3 + 1/7", "10/21");
    assert_display_prefix("10^400", "1e+400");
    assert_display_prefix("10^400 * 10^400", "1e+800");
    assert_value("10^400 / 10^399", 10.0);
    assert_value("10^400 - 10^400", 0.0);
    assert_display_prefix("(10^400)^(1/2)", "1e+200");
    assert_display_prefix("sqrt(10^401)", "3.16227766016838e+200");
    assert_display_prefix("10^-400", "1e-400");

    // Exact rational exponents.
    assert_exact("4^(1/2)", "2");
    assert_exact("8^(2/3)", "4");
    assert_exact("(-8)^(1/3)", "-2");
    assert_exact("2^(1/2)", "sqrt(2)");
    assert_exact("2^0.5", "sqrt(2)");
    assert_exact("(27/8)^(-2/3)", "4/9");
    assert_exact("12^(3/2)", "24sqrt(3)");
    assert_relative_value("2^(1/3)", std::cbrt(2.0));
    assert_error("(-8)^(1/2)", "Negative base with non-integer exponent");
    assert_relative_value("(-8)^(1/3) * 2", -4.0);

    // Exact forms always describe the value they belong to.
    assert_exact("2pi", "2π");
    assert_exact("2pi/3", "2π/3");
    assert_exact("pi^2", "π^2");
    assert_exact("1/pi", "1/π");
    assert_exact("pi^-1", "1/π");
    assert_exact("e/(2pi)", "e/(2π)");
    assert_exact("pi/e", "π/e");
    assert_exact("-sqrt(3)/2", "-sqrt(3)/2");
    assert_exact("3sqrt(2)", "3sqrt(2)");
    assert_exact("sqrt(8)", "2sqrt(2)");
    assert_exact("sqrt(1/2)", "sqrt(2)/2");
    assert_exact("phi", "ϕ");
    assert_exact("-phi", "");
    assert_exact("2phi", "");
    assert_exact("sqrt(pi^2)", "π");

    // Factorials and combinatorics.
    assert_exact("20!", "2432902008176640000");
    assert_approximate("20!", 0);
    assert_approximate("21!", 1);
    assert_exact("nCr(62, 31)", "465428353255261088");
    assert_exact("nCr(66, 33)", "7219428434016265740");
    assert_relative_value("nCr(68, 34)", 28453041475240576740.0);
    assert_display_prefix("nCr(100, 50)", "1.0089134454556");
    assert_exact("nPr(20, 20)", "2432902008176640000");
    assert_approximate("nPr(25, 25)", 1);
    assert_relative_value("lcm(2^62, 3)", 3.0 * std::pow(2.0, 62.0));
    assert_value("mod(-7, 3)", 2.0);
    assert_exact("mod(7.5, 2)", "3/2");
    assert_value("mod(7, -3)", -2.0);
    assert_value("mod(5.5, 2.5)", 0.5);

    // Exact trigonometry over multiples of pi/12 and degrees.
    assert_exact("sin(pi/4)", "sqrt(2)/2");
    assert_exact("cos(3pi/4)", "-sqrt(2)/2");
    assert_exact("tan(pi/3)", "sqrt(3)");
    assert_exact("tan(pi/6)", "sqrt(3)/3");
    assert_exact("tan(5pi/6)", "-sqrt(3)/3");
    assert_exact("sin(30°)", "1/2");
    assert_exact("sin(45°)", "sqrt(2)/2");
    assert_exact("cos(120°)", "-1/2");
    assert_exact("cos(-60°)", "1/2");
    assert_exact("180°", "π");
    assert_exact("sin(1000000pi)", "0");
    assert_exact("cos(1000001pi)", "-1");
    assert_relative_value("sin(5pi/12)", std::sin(5.0 * pi / 12.0));
    assert_relative_value("sin(1°)", std::sin(pi / 180.0));
    assert_error("tan(-pi/2)", "Tangent is undefined at odd multiples of pi/2");
    assert_error("tan(270°)", "Tangent is undefined at odd multiples of pi/2");
    assert_value("sin(30°)^2 + cos(30°)^2", 1.0);
    assert_approximate("sin(30°)^2 + cos(30°)^2", 0);

    // Inverse trigonometry and exponentials.
    assert_exact("asin(1/2)", "π/6");
    assert_exact("acos(1/2)", "π/3");
    assert_exact("acos(-1)", "π");
    assert_exact("acos(0)", "π/2");
    assert_exact("atan(1)", "π/4");
    assert_exact("atan(sqrt(3))", "π/3");
    assert_exact("atan(1/sqrt(3))", "π/6");
    assert_exact("asin(sqrt(2)/2)", "π/4");
    assert_exact("asin(-sqrt(3)/2)", "-π/3");
    assert_exact("acos(-sqrt(2)/2)", "3π/4");
    assert_relative_value("asin(0.3)", std::asin(0.3));
    assert_relative_value("acos(0.3)", std::acos(0.3));
    assert_relative_value("atan(10)", std::atan(10.0));
    assert_error("asin(2)", "Inverse sine is only defined on [-1, 1]");
    assert_error("acos(-1.5)", "Inverse cosine is only defined on [-1, 1]");
    assert_exact("exp(0)", "1");
    assert_exact("exp(1)", "e");
    assert_exact("exp(2)", "e^2");
    assert_exact("exp(-1)", "1/e");
    assert_relative_value("exp(0.5)", std::exp(0.5));
    assert_exact("ln(exp(3))", "3");
    assert_relative_value("ln(10)", std::log(10.0));
    assert_relative_value("log(10^400)", 400.0);
    assert_relative_value("ln(10^400)", 400.0 * std::log(10.0));
    assert_error("exp(1, 2)", "exp requires exactly 1 argument");
    assert_error("log(1, 2, 3)", "log requires 1 or 2 arguments");
    assert_error("root(3)", "root requires exactly 2 arguments");

    // Bound variables shadow constants and split juxtaposed names.
    assert_value("sum(e, 1, 3, e)", 6.0);
    assert_relative_value("sum(i, 1, 3, ie)", 6.0 * e);
    assert_relative_value("pie", pi * e);
    assert_relative_value("2pie", 2.0 * pi * e);
    assert_relative_value("sum(x, 1, 2, xpi)", 3.0 * pi);
    assert_relative_value("sum(x, 1, 2, xsin(x))", std::sin(1.0) + 2.0 * std::sin(2.0));
    assert_error("xpi", "Unknown identifier: xpi");
    assert_error("pi (sum(i, 1, 12, i (prod(i, 1, 3, i ^ (x)))))", "Unknown identifier: x");
    assert_relative_value("pi (sum(i, 1, 12, i (prod(i, 1, 3, i ^ (2)))))", 2808.0 * pi);
    assert_value("integral(0, 1, e, e)", 0.5);
    assert_value("integral(0, 1, t, t)", 0.5);
    assert_value("sum(i, 1, 3, sum(j, 1, i, j))", 10.0);
    assert_value("sum(i, 1, 3, i) + sum(i, 1, 2, i)", 9.0);
    assert_error("sum(i, 1, 3, i) + i", "Unknown identifier: i");

    // Numerical calculus.
    assert_value("integral(0, 1, x, derivative(t, x, t^2))", 1.0);
    assert_value("integral(0, pi, x, sin(x))", 2.0);
    assert_exact("integral(0, pi, x, sin(x))", "");
    assert_value("integral(2, 0, x, x^2)", -8.0 / 3.0);
    assert_value("derivative(x, 1, sin(x))", std::cos(1.0));
    assert_value("derivative(x, 2, e^x)", std::exp(2.0));
    assert_value("derivative(x, 0.5, ln(x))", 2.0);
    assert_value("derivative(x, 0.01, sqrt(x))", 5.0);
    assert_value("derivative(x, 4, |x|)", 1.0);
    assert_value("derivative(x, 100, x^3)", 30000.0);
    assert_value("derivative_n(2, x, 0, cos(x))", -1.0);
    assert_value("derivative_n(3, x, 1, x^4)", 24.0);
    assert_value("sum(k, 1, 3, derivative(x, k, x^2))", 12.0);
    assert_value("derivative(pi, sin(x))", -1.0);
    assert_value("limit(x, 0, sin(x)/x)", 1.0);
    assert_value("limit(x, 0, right, |x|/x)", 1.0);
    assert_value("limit(x, 0, left, |x|/x)", -1.0);
    assert_error("limit(x, 0, |x|/x)", "Limit does not converge");
    assert_value("limit(x, -infinity, e^x)", 0.0);
    assert_value("limit(x, infinity, (1 + 1/x)^x)", e);
    assert_value("limit(x, 2, (x^2 - 4)/(x - 2))", 4.0);
    assert_value("limit(x, 0, (1 - cos(x))/x^2)", 0.5);
    assert_error("limit(x, 0, right, 1/x)", "Limit diverges to infinity");
    assert_error("limit(x, 0, left, 1/x)", "Limit diverges to -infinity");
    assert_error("limit(x, 0, 1/x^2)", "Limit diverges to infinity");
    assert_error("limit(x, 0, 1/x)", "Limit does not converge");
    assert_error("limit(x, 0, sin(1/x))", "Limit does not converge");
    assert_error("limit(x, infinity, e^x)", "Limit diverges to infinity");
    assert_value("limit(x, infinity, x/(x + 1))", 1.0);
    assert_value("limit(x, 1, right, sqrt(x - 1))", 0.0);

    // Lexer: decimal literals only.
    assert_error("0x1A", "Unknown identifier: x1A");
    assert_value("2e3", 2000.0);
    assert_relative_value("2e", 2.0 * e);
    assert_value("1.5e-3", 0.0015);
    assert_value("3.e2", 300.0);
    assert_value("3°!", 0.0 + std::tgamma(1.0 + pi / 60.0));
}

int main() {
    run_audit_regressions();

    assert_value("2 + 3 * 4", 14.0);
    assert_value("(2 + 3) * 4", 20.0);
    assert_value("3^(2-6)", 1.0 / 81.0);
    assert_value("2^3^2", 512.0);
    assert_value("-3^2", -9.0);
    assert_value("(-3)^2", 9.0);
    assert_value("0.5 + .25", 0.75);
    assert_approximate("0.5 + .25", 0);
    assert_value("0.5 + 0.5", 1.0);
    assert_approximate("0.5 + 0.5", 0);
    assert_value("0.25 * 4", 1.0);
    assert_approximate("0.25 * 4", 0);
    assert_value("1.5 * 2", 3.0);
    assert_approximate("1.5 * 2", 0);
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
    assert_value("sin(0)", 0.0);
    assert_value("cos(0)", 1.0);
    assert_value("tan(0)", 0.0);
    assert_value("sin(pi/6)", 0.5);
    assert_exact("sin(pi/6)", "1/2");
    assert_value("cos(pi/3)", 0.5);
    assert_exact("cos(pi/3)", "1/2");
    assert_value("sin(pi/2)", 1.0);
    assert_value("cos(pi)", -1.0);
    assert_value("tan(pi/4)", 1.0);
    assert_value("sin(pi/3)", std::sqrt(3.0) / 2.0);
    assert_value("cos(pi/6)", std::sqrt(3.0) / 2.0);
    assert_value("sin(3pi/2)", -1.0);
    assert_value("cos(3pi/2)", 0.0);
    assert_value("tan(3pi/4)", -1.0);
    assert_value("sin(-pi/6)", -0.5);
    assert_value("sin(0.5)", std::sin(0.5));
    assert_value("cos(0.5)", std::cos(0.5));
    assert_value("tan(0.5)", std::tan(0.5));
    assert_error("tan(pi/2)", "Tangent is undefined at odd multiples of pi/2");
    assert_error("sin(0, 1)", "sin requires exactly 1 argument");
    assert_value("sin(30°)", 0.5);
    assert_value("cos(60°)", 0.5);
    assert_value("tan(45°)", 1.0);
    assert_value("sin(0°)", 0.0);
    assert_error("tan(90°)", "Tangent is undefined at odd multiples of pi/2");
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

    // New elementary arithmetic & combinatorics
    assert_value("|-5|", 5.0);
    assert_approximate("|-5|", 0);
    assert_value("|3-7|", 4.0);
    assert_approximate("|3-7|", 0);
    assert_value("abs(-42)", 42.0);
    assert_approximate("abs(-42)", 0);
    assert_value("gcd(24, 36)", 12.0);
    assert_approximate("gcd(24, 36)", 0);
    assert_value("lcm(24, 36)", 72.0);
    assert_approximate("lcm(24, 36)", 0);
    assert_value("mod(17, 5)", 2.0);
    assert_approximate("mod(17, 5)", 0);
    assert_value("nCr(10, 3)", 120.0);
    assert_approximate("nCr(10, 3)", 0);
    assert_value("comb(5, 2)", 10.0);
    assert_approximate("comb(5, 2)", 0);
    assert_value("nPr(10, 3)", 720.0);
    assert_approximate("nPr(10, 3)", 0);
    assert_value("perm(5, 2)", 20.0);
    assert_approximate("perm(5, 2)", 0);
    assert_approximate("phi", 1);
    assert_value("phi", (1.0 + std::sqrt(5.0)) / 2.0);

    // Capital Sigma (Sum) and Capital Pi (Prod) tests
    assert_value("sum(i, 1, 5, i)", 15.0);
    assert_approximate("sum(i, 1, 5, i)", 0);
    assert_value("sum(i, 1, 5)(i)", 15.0);
    assert_approximate("sum(i, 1, 5)(i)", 0);
    assert_value("sum(i, 1, 5, i^2)", 55.0);
    assert_approximate("sum(i, 1, 5, i^2)", 0);
    assert_value("sum(i, 1, 5)(i^2)", 55.0);
    assert_approximate("sum(i, 1, 5)(i^2)", 0);
    assert_value("sum(k, 0, 4, 2k+1)", 25.0);
    assert_approximate("sum(k, 0, 4, 2k+1)", 0);
    assert_value("prod(i, 1, 5, i)", 120.0);
    assert_approximate("prod(i, 1, 5, i)", 0);
    assert_value("prod(i, 1, 5)(i)", 120.0);
    assert_approximate("prod(i, 1, 5)(i)", 0);
    assert_value("prod(i, 1, 4, i+1)", 120.0);
    assert_relative_value("prod(x, 3, 19, 6^2)", std::pow(6.0, 34.0));
    assert_approximate("prod(x, 3, 19, 6^2)", 1);
    assert_relative_value("6^34", std::pow(6.0, 34.0));
    assert_display_prefix("prod(x, 1, 9999, 3^3)", "1.607");
    assert_approximate("prod(x, 1, 9999, 3^3)", 1);
    assert_value("integral(0, 2, x, x^2)", 8.0 / 3.0);
    assert_value("integral(1, 3, x, x^2)", 26.0 / 3.0);
    assert_exact("integral(1, 3, x, x^2)", "26/3");
    assert_value("integral(0, 2, x^2)", 8.0 / 3.0);
    assert_value("int(1, 3, x, x^2)", 26.0 / 3.0);
    assert_value("3*integral(0, 2, x, x^2)", 8.0);
    assert_exact("2*integral(1, 3, x, x^2)", "52/3");
    assert_value("derivative(x, 3, x^2)", 6.0);
    assert_value("derivative(x, x^2)", 0.0);
    assert_value("derivative_n(2, x, 3, x^3)", 18.0);
    assert_value("limit(x, 0, x^2)", 0.0);
    assert_value("limit(x, infinity, 1/x)", 0.0);
    assert_error("int", "Integral requires arguments in parentheses: integral(lower, upper, variable, integrand)");
    assert_error("integral(0, infinity, x, 1/x)", "Infinite bounds are not supported for numerical integration");
    assert_error("integral(1, 30, x, x^3999)", "Finite result exceeds the native floating-point range");
    assert_approximate("prod(i, 1, 4, i+1)", 0);
    assert_error("sum(i, 5, 2, i)", "Lower bound cannot be greater than upper bound");
    assert_error("sum(i, 1.5, 5, i)", "Lower bound must be an integer");
    assert_error("sum(i, 1, 5.5, i)", "Upper bound must be an integer");
    assert_error("sum(i, 1, oo, i)", "Infinite bounds are not supported");
    assert_error("prod(i, 1, inf, i)", "Infinite bounds are not supported");
    assert_error("sum(i, 1.2e0, 5, i)", "Lower bound must be an integer");
    assert_error("integral(∞, 2, x, x)", "Infinite bounds are not supported for numerical integration");

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

    if (failures != 0) {
        std::printf("%d engine test(s) failed\n", failures);
        return 1;
    }
    std::printf("All engine tests passed (%d checks)\n", checks);
    return 0;
}
