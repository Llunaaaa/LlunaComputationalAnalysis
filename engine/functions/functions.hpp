#pragma once

#include <cmath>
#include <string>
#include <stdexcept>

namespace lluna::functions {

struct FunctionResult {
    double value;
    bool is_approximate;
    std::string exact_repr;
};

inline FunctionResult eval_sqrt(double arg) {
    if (arg < 0.0) {
        throw std::runtime_error("Cannot take the square root of a negative value");
    }
    double res = std::sqrt(arg);
    if (!std::isfinite(res)) {
        throw std::runtime_error("The result is not finite");
    }
    bool is_exact = (res == std::floor(res));
    return {res, !is_exact, is_exact ? "" : "sqrt(" + std::to_string(static_cast<long long>(arg)) + ")"};
}

inline FunctionResult eval_root(double index, double arg) {
    if (!std::isfinite(index) || index <= 0.0 || std::floor(index) != index) {
        throw std::runtime_error("Root index must be a positive integer");
    }
    if (arg < 0.0 && std::fmod(index, 2.0) == 0.0) {
        throw std::runtime_error("Even roots cannot contain a negative value");
    }
    double root_val = std::pow(std::fabs(arg), 1.0 / index);
    if (!std::isfinite(root_val)) {
        throw std::runtime_error("The result is not finite");
    }
    double res = (arg < 0.0) ? -root_val : root_val;
    bool is_exact = (root_val == std::floor(root_val));
    return {res, !is_exact, ""};
}

inline FunctionResult eval_log(double base, double arg) {
    if (base <= 0.0 || base == 1.0) {
        throw std::runtime_error("Logarithm base must be positive and not equal to 1");
    }
    if (arg <= 0.0) {
        throw std::runtime_error("Logarithm argument must be positive");
    }
    double res = std::log(arg) / std::log(base);
    if (!std::isfinite(res)) {
        throw std::runtime_error("The result is not finite");
    }
    bool is_exact = (res == std::floor(res));
    return {res, !is_exact, is_exact ? "" : "log(" + std::to_string(static_cast<long long>(arg)) + ")"};
}

inline FunctionResult eval_ln(double arg) {
    if (arg <= 0.0) {
        throw std::runtime_error("Logarithm argument must be positive");
    }
    double res = std::log(arg);
    if (!std::isfinite(res)) {
        throw std::runtime_error("The result is not finite");
    }
    bool is_exact = (res == std::floor(res));
    return {res, !is_exact, ""};
}

inline FunctionResult eval_factorial(double n) {
    if (n < 0.0 || std::floor(n) != n || n > 170.0) {
        throw std::runtime_error("Factorial requires an integer from 0 to 170");
    }
    double fact = 1.0;
    for (int i = 2; i <= static_cast<int>(n); ++i) {
        fact *= i;
    }
    return {fact, false, ""};
}

inline bool is_function_name(const std::string& name) {
    return name == "sqrt" || name == "root" || name == "log" || name == "ln";
}

} // namespace lluna::functions
