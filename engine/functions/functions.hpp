#pragma once

#include "../core/number_value.hpp"
#include "../constants/constants.hpp"
#include <cmath>
#include <string>
#include <stdexcept>
#include <limits>

namespace lluna::functions {

inline core::NumberValue eval_sqrt(const core::NumberValue& arg) {
    if (arg.is_negative()) {
        throw std::runtime_error("Cannot take the square root of a negative value");
    }
    if (arg.is_zero()) {
        return core::NumberValue(0.0, false);
    }

    if (!arg.is_large()) {
        double d = arg.value_;
        double res = std::sqrt(d);
        bool is_exact = (res == std::floor(res));
        std::string exact_str = is_exact ? "" : "sqrt(" + std::to_string(static_cast<long long>(d)) + ")";
        return core::NumberValue(res, !is_exact, exact_str);
    }

    long long exp = arg.exponent();
    double man = arg.mantissa();
    if (exp % 2 != 0) {
        man *= 10.0;
        exp -= 1;
    }
    double res_man = std::sqrt(man);
    long long res_exp = exp / 2;
    return core::NumberValue::from_scientific(res_man, res_exp, true);
}

inline core::NumberValue eval_root(const core::NumberValue& idx, const core::NumberValue& arg) {
    if (!idx.is_integer() || idx.is_negative() || idx.is_zero()) {
        throw std::runtime_error("Root index must be a positive integer");
    }
    long long n = idx.to_integer();
    if (arg.is_negative() && n % 2 == 0) {
        throw std::runtime_error("Even roots cannot contain a negative value");
    }
    double sign = arg.is_negative() ? -1.0 : 1.0;

    if (!arg.is_large()) {
        double d = std::fabs(arg.value_);
        double res = std::pow(d, 1.0 / static_cast<double>(n));
        bool is_exact = (res == std::floor(res));
        return core::NumberValue(sign * res, !is_exact, "");
    }

    double log10_val = std::log10(std::fabs(arg.mantissa())) + static_cast<double>(arg.exponent());
    double res_log = log10_val / static_cast<double>(n);
    long long res_exp = static_cast<long long>(std::floor(res_log));
    double rem = res_log - static_cast<double>(res_exp);
    double res_man = sign * std::pow(10.0, rem);
    return core::NumberValue::from_scientific(res_man, res_exp, true);
}

inline core::NumberValue eval_log(const core::NumberValue& base, const core::NumberValue& arg) {
    if (base.is_negative() || base.is_zero() || (!base.is_large() && base.value_ == 1.0)) {
        throw std::runtime_error("Logarithm base must be positive and not equal to 1");
    }
    if (arg.is_negative() || arg.is_zero()) {
        throw std::runtime_error("Logarithm argument must be positive");
    }
    double log10_arg = std::log10(std::fabs(arg.mantissa())) + static_cast<double>(arg.exponent());
    double log10_base = std::log10(std::fabs(base.mantissa())) + static_cast<double>(base.exponent());
    double res = log10_arg / log10_base;
    if (!std::isfinite(res)) {
        throw std::runtime_error("The result is not finite");
    }
    bool is_exact = (res == std::floor(res));
    return core::NumberValue(res, !is_exact, is_exact ? "" : "log(" + arg.format() + ")");
}

inline core::NumberValue eval_ln(const core::NumberValue& arg) {
    if (arg.is_negative() || arg.is_zero()) {
        throw std::runtime_error("Logarithm argument must be positive");
    }
    double log10_arg = std::log10(std::fabs(arg.mantissa())) + static_cast<double>(arg.exponent());
    double res = log10_arg * std::log(10.0);
    if (!std::isfinite(res)) {
        throw std::runtime_error("The result is not finite");
    }
    bool is_exact = (res == std::floor(res));
    return core::NumberValue(res, !is_exact, "");
}

inline core::NumberValue eval_factorial(const core::NumberValue& arg) {
    if (arg.is_negative()) {
        throw std::runtime_error("Cannot take factorial of a negative value");
    }
    if (!arg.is_integer()) {
        throw std::runtime_error("Factorial of a non-integer requires the gamma function");
    }

    // Computational Guardrail: upper bound of 1e18 (1 quintillion) to prevent
    // system freeze and exponent tracking overflow
    if (arg.exponent() > 18 || (arg.exponent() == 18 && std::fabs(arg.mantissa()) > 1.0) || arg.to_double() > 1e18) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }

    double d = arg.to_double();
    long long n = static_cast<long long>(d);
    if (n <= 1) {
        return core::NumberValue(1.0, false);
    }

    // Requirement 1: For n <= 100000, keep loop-based logic for maximum double-precision accuracy
    if (n <= 100000) {
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

    // Requirement 2: For n > 100000, use log10-based Stirling's Approximation:
    // log10(n!) ≈ 0.5 * log10(2 * pi * n) + n * (log10(n) - log10(e))
    double pi_val = constants::compute_pi();
    double log10_2pi = std::log10(2.0 * pi_val);
    double log10_e = std::log10(constants::compute_euler());
    double log10_n = std::log10(static_cast<double>(n));
    double log10_fact = 0.5 * (log10_2pi + log10_n) + static_cast<double>(n) * (log10_n - log10_e);

    if (!std::isfinite(log10_fact) ||
        log10_fact >= static_cast<double>(std::numeric_limits<long long>::max()) - 1000.0) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }

    long long exponent = static_cast<long long>(std::floor(log10_fact));
    double rem = log10_fact - static_cast<double>(exponent);
    double mantissa = std::pow(10.0, rem);

    while (mantissa >= 10.0) {
        mantissa /= 10.0;
        exponent += 1;
    }
    while (mantissa < 1.0 && mantissa > 0.0) {
        mantissa *= 10.0;
        exponent -= 1;
    }

    return core::NumberValue::from_scientific(mantissa, exponent, true);
}

inline bool is_function_name(const std::string& name) {
    return name == "sqrt" || name == "root" || name == "log" || name == "ln";
}

} // namespace lluna::functions
