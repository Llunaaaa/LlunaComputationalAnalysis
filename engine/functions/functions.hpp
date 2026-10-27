#pragma once

#include "../core/number_value.hpp"
#include <cmath>
#include <string>
#include <stdexcept>

namespace lluna::functions {

inline core::NumberValue eval_sqrt(const core::NumberValue& arg) {
    if (arg.mantissa < 0.0) {
        throw std::runtime_error("Cannot take the square root of a negative value");
    }
    if (arg.mantissa == 0.0) {
        return core::NumberValue(0.0, false);
    }

    double d = arg.to_double();
    if (std::isfinite(d)) {
        double res = std::sqrt(d);
        bool is_exact = (res == std::floor(res));
        std::string exact_str = is_exact ? "" : "sqrt(" + std::to_string(static_cast<long long>(d)) + ")";
        return core::NumberValue(res, !is_exact, exact_str);
    }

    long long exp = arg.exponent;
    double man = arg.mantissa;
    if (exp % 2 != 0) {
        man *= 10.0;
        exp -= 1;
    }
    double res_man = std::sqrt(man);
    long long res_exp = exp / 2;
    return core::NumberValue::from_scientific(res_man, res_exp, true);
}

inline core::NumberValue eval_root(const core::NumberValue& idx, const core::NumberValue& arg) {
    if (!idx.is_integer() || idx.mantissa <= 0.0) {
        throw std::runtime_error("Root index must be a positive integer");
    }
    long long n = static_cast<long long>(idx.to_double());
    if (arg.mantissa < 0.0 && n % 2 == 0) {
        throw std::runtime_error("Even roots cannot contain a negative value");
    }
    double sign = (arg.mantissa < 0.0) ? -1.0 : 1.0;
    core::NumberValue abs_arg = arg;
    if (sign < 0) abs_arg.mantissa = -abs_arg.mantissa;

    double d = abs_arg.to_double();
    if (std::isfinite(d)) {
        double res = std::pow(d, 1.0 / static_cast<double>(n));
        bool is_exact = (res == std::floor(res));
        return core::NumberValue(sign * res, !is_exact, "");
    }

    double log10_val = std::log10(abs_arg.mantissa) + static_cast<double>(abs_arg.exponent);
    double res_log = log10_val / static_cast<double>(n);
    long long res_exp = static_cast<long long>(std::floor(res_log));
    double rem = res_log - static_cast<double>(res_exp);
    double res_man = sign * std::pow(10.0, rem);
    return core::NumberValue::from_scientific(res_man, res_exp, true);
}

inline core::NumberValue eval_log(const core::NumberValue& base, const core::NumberValue& arg) {
    if (base.mantissa <= 0.0 || (base.exponent == 0 && base.mantissa == 1.0)) {
        throw std::runtime_error("Logarithm base must be positive and not equal to 1");
    }
    if (arg.mantissa <= 0.0) {
        throw std::runtime_error("Logarithm argument must be positive");
    }
    double log10_arg = std::log10(arg.mantissa) + static_cast<double>(arg.exponent);
    double log10_base = std::log10(base.mantissa) + static_cast<double>(base.exponent);
    double res = log10_arg / log10_base;
    if (!std::isfinite(res)) {
        throw std::runtime_error("The result is not finite");
    }
    bool is_exact = (res == std::floor(res));
    return core::NumberValue(res, !is_exact, is_exact ? "" : "log(" + arg.format() + ")");
}

inline core::NumberValue eval_ln(const core::NumberValue& arg) {
    if (arg.mantissa <= 0.0) {
        throw std::runtime_error("Logarithm argument must be positive");
    }
    double log10_arg = std::log10(arg.mantissa) + static_cast<double>(arg.exponent);
    double res = log10_arg * std::log(10.0);
    if (!std::isfinite(res)) {
        throw std::runtime_error("The result is not finite");
    }
    bool is_exact = (res == std::floor(res));
    return core::NumberValue(res, !is_exact, "");
}

inline core::NumberValue eval_factorial(const core::NumberValue& arg) {
    if (arg.mantissa < 0.0) {
        throw std::runtime_error("Cannot take factorial of a negative value");
    }
    if (!arg.is_integer()) {
        throw std::runtime_error("Factorial of a non-integer requires the gamma function");
    }
    double d = arg.to_double();
    if (d > 100000.0) {
        throw std::runtime_error("Factorial exceeds calculation limit (max 100,000)");
    }
    long long n = static_cast<long long>(d);
    if (n <= 1) {
        return core::NumberValue(1.0, false);
    }
    if (n <= 170) {
        double fact = 1.0;
        for (long long i = 2; i <= n; ++i) {
            fact *= static_cast<double>(i);
        }
        return core::NumberValue(fact, false);
    }

    double mantissa = 1.0;
    long long exponent = 0;
    for (long long i = 2; i <= n; ++i) {
        mantissa *= static_cast<double>(i);
        while (mantissa >= 1e12) {
            mantissa /= 1e12;
            exponent += 12;
        }
    }
    while (mantissa >= 10.0) {
        mantissa /= 10.0;
        exponent += 1;
    }
    while (mantissa < 1.0 && mantissa > 0.0) {
        mantissa *= 10.0;
        exponent -= 1;
    }
    return core::NumberValue::from_scientific(mantissa, exponent, false);
}

inline bool is_function_name(const std::string& name) {
    return name == "sqrt" || name == "root" || name == "log" || name == "ln";
}

} // namespace lluna::functions
