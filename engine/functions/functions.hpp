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
        return core::NumberValue(0);
    }
    if (arg.kind == core::ValueKind::ExactRational) {
        return core::NumberValue::make_sqrt(arg.rat);
    }
    if (arg.kind == core::ValueKind::ExactConstant) {
        if (arg.pi_exp % 2 == 0 && arg.e_exp % 2 == 0) {
            core::NumberValue v;
            v.kind = core::ValueKind::ExactConstant;
            v.rat = core::NumberValue::make_sqrt(arg.rat).rat;
            v.pi_exp = arg.pi_exp / 2;
            v.e_exp = arg.e_exp / 2;
            return v;
        }
    }

    double d = arg.to_double();
    if (std::isfinite(d)) {
        double res = std::sqrt(d);
        return core::NumberValue::make_approx(res);
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

    if (n == 1) return arg;
    if (n == 2) {
        if (sign < 0) throw std::runtime_error("Cannot take the square root of a negative value");
        return eval_sqrt(arg);
    }

    if (arg.kind == core::ValueKind::ExactRational && arg.rat.is_integer()) {
        long long abs_val = std::abs(arg.rat.num);
        long long root_cand = static_cast<long long>(std::round(std::pow(static_cast<double>(abs_val), 1.0 / static_cast<double>(n))));
        long long p = 1;
        for (long long i = 0; i < n; ++i) p *= root_cand;
        if (p == abs_val) {
            return core::NumberValue(static_cast<long long>(sign * root_cand));
        }
    }

    double d = std::fabs(arg.to_double());
    if (std::isfinite(d)) {
        double res = std::pow(d, 1.0 / static_cast<double>(n));
        return core::NumberValue::make_approx(sign * res);
    }

    double log10_val = std::log10(std::fabs(arg.mantissa())) + static_cast<double>(arg.exponent());
    double res_log = log10_val / static_cast<double>(n);
    long long res_exp = static_cast<long long>(std::floor(res_log));
    double rem = res_log - static_cast<double>(res_exp);
    double res_man = sign * std::pow(10.0, rem);
    return core::NumberValue::from_scientific(res_man, res_exp, true);
}

inline core::NumberValue eval_log(const core::NumberValue& base, const core::NumberValue& arg) {
    if (base.is_negative() || base.is_zero()) {
        throw std::runtime_error("Logarithm base must be positive and not equal to 1");
    }
    if (arg.is_negative() || arg.is_zero()) {
        throw std::runtime_error("Logarithm argument must be positive");
    }

    // Symbolic cancellation: log_b(b) = 1
    if (base.kind == arg.kind) {
        if (base.kind == core::ValueKind::ExactRational && base.rat.num == arg.rat.num && base.rat.den == arg.rat.den) {
            if (base.rat.is_one()) throw std::runtime_error("Logarithm base cannot be 1");
            return core::NumberValue(1);
        }
        if (base.kind == core::ValueKind::ExactConstant && base.pi_exp == arg.pi_exp && base.e_exp == arg.e_exp && base.rat.num == arg.rat.num && base.rat.den == arg.rat.den) {
            return core::NumberValue(1);
        }
    }

    if (base.kind == core::ValueKind::ExactRational && base.rat.is_one()) {
        throw std::runtime_error("Logarithm base cannot be 1");
    }
    if (arg.kind == core::ValueKind::ExactRational && arg.rat.is_one()) {
        return core::NumberValue(0);
    }

    // Check if integer log: e.g. log_2(8) = 3, log_10(100) = 2, log_10(1000) = 3
    if (base.kind == core::ValueKind::ExactRational && base.rat.is_integer() &&
        arg.kind == core::ValueKind::ExactRational && arg.rat.is_integer()) {
        auto [is_pow, p] = core::check_integer_log(base.rat.num, arg.rat.num);
        if (is_pow) {
            return core::NumberValue(p);
        }
    }

    double log10_arg = std::log10(std::fabs(arg.mantissa())) + static_cast<double>(arg.exponent());
    double log10_base = std::log10(std::fabs(base.mantissa())) + static_cast<double>(base.exponent());
    double res = log10_arg / log10_base;
    if (!std::isfinite(res)) {
        throw std::runtime_error("The result is not finite");
    }
    return core::NumberValue::make_approx(res);
}

inline core::NumberValue eval_ln(const core::NumberValue& arg) {
    if (arg.is_negative() || arg.is_zero()) {
        throw std::runtime_error("Logarithm argument must be positive");
    }

    // Symbolic cancellation: ln(e) = 1, ln(e^m) = m
    if (arg.kind == core::ValueKind::ExactConstant && arg.pi_exp == 0 && arg.rat.is_one()) {
        return core::NumberValue(arg.e_exp);
    }
    if (arg.kind == core::ValueKind::ExactRational && arg.rat.is_one()) {
        return core::NumberValue(0);
    }

    double log10_arg = std::log10(std::fabs(arg.mantissa())) + static_cast<double>(arg.exponent());
    double res = log10_arg / std::log10(constants::compute_euler());
    if (!std::isfinite(res)) {
        throw std::runtime_error("The result is not finite");
    }
    return core::NumberValue::make_approx(res);
}

inline core::NumberValue eval_factorial(const core::NumberValue& arg) {
    // 1. Negative integers are undefined in mathematics (poles of the Gamma function)
    if (arg.is_negative() && arg.is_integer()) {
        throw std::runtime_error("Factorial is undefined for negative integers");
    }

    // 2. Computational Guardrail: upper bound of 1e18 (1 quintillion) to prevent
    // system freeze and exponent tracking overflow
    if (arg.exponent() > 18 || (arg.exponent() == 18 && std::fabs(arg.mantissa()) > 1.0) || std::fabs(arg.to_double()) > 1e18) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }

    // 3. Non-negative integers
    if (arg.is_integer() && !arg.is_negative()) {
        double d = arg.to_double();
        long long n = static_cast<long long>(std::round(d));
        if (n <= 1) {
            return core::NumberValue(1.0, false);
        }
        // Exact integers in IEEE-754 double (up to 18! = 6.4e15 < 2^53)
        if (n <= 18) {
            double fact = 1.0;
            for (long long i = 2; i <= n; ++i) {
                fact *= static_cast<double>(i);
            }
            return core::NumberValue(fact, false);
        }
        if (n <= 170) {
            double fact = 1.0;
            for (long long i = 2; i <= n; ++i) {
                fact *= static_cast<double>(i);
            }
            // For n > 18, double precision rounds lower bits, so it's an approximation
            return core::NumberValue(fact, true);
        }

        // Loop-based logic up to 100,000 for maximum accuracy
        if (n <= 100000) {
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
            return core::NumberValue::from_scientific(mantissa, exponent, true);
        }

        // For n > 100,000: Stirling's approximation with Ramanujan 1/(12n) correction
        double pi_val = constants::compute_pi();
        double log10_2pi = std::log10(2.0 * pi_val);
        double log10_e = std::log10(constants::compute_euler());
        double log10_n = std::log10(static_cast<double>(n));
        double log10_fact = 0.5 * (log10_2pi + log10_n) + static_cast<double>(n) * (log10_n - log10_e)
                           + (1.0 / (12.0 * static_cast<double>(n))) * log10_e;

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

    // 4. Non-integers (both positive and negative):
    // Standard mathematical extension via Euler's Gamma function: x! = Gamma(x + 1)
    double x = arg.to_double();
    if (std::fabs(x) <= 170.0) {
        double val = std::tgamma(x + 1.0);
        if (!std::isfinite(val)) {
            throw std::runtime_error("The result is not finite");
        }
        return core::NumberValue(val, true);
    }

    // For large non-integers |x| > 170:
    if (x > 170.0) {
        double pi_val = constants::compute_pi();
        double log10_2pi = std::log10(2.0 * pi_val);
        double log10_e = std::log10(constants::compute_euler());
        double log10_x = std::log10(x);
        double log10_fact = 0.5 * (log10_2pi + log10_x) + x * (log10_x - log10_e)
                           + (1.0 / (12.0 * x)) * log10_e;

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

    // For negative non-integers x < -170:
    // Euler's reflection formula: Gamma(x + 1) = pi / (sin(pi * (x + 1)) * Gamma(-x))
    double pi_val = constants::compute_pi();
    double pos_arg = -x;
    double log10_2pi = std::log10(2.0 * pi_val);
    double log10_e = std::log10(constants::compute_euler());
    double log10_pos = std::log10(pos_arg);
    double log10_gamma_pos = 0.5 * (log10_2pi + log10_pos) + pos_arg * (log10_pos - log10_e)
                           + (1.0 / (12.0 * pos_arg)) * log10_e;

    double sin_val = std::sin(pi_val * (x + 1.0));
    if (sin_val == 0.0) {
        throw std::runtime_error("Factorial is undefined for negative integers");
    }
    double sign = sin_val < 0.0 ? -1.0 : 1.0;
    double log10_fact = std::log10(pi_val) - std::log10(std::fabs(sin_val)) - log10_gamma_pos;

    long long exponent = static_cast<long long>(std::floor(log10_fact));
    double rem = log10_fact - static_cast<double>(exponent);
    double mantissa = sign * std::pow(10.0, rem);

    while (std::fabs(mantissa) >= 10.0) {
        mantissa /= 10.0;
        exponent += 1;
    }
    while (std::fabs(mantissa) < 1.0 && mantissa != 0.0) {
        mantissa *= 10.0;
        exponent -= 1;
    }

    return core::NumberValue::from_scientific(mantissa, exponent, true);
}

inline bool is_function_name(const std::string& name) {
    return name == "sqrt" || name == "root" || name == "log" || name == "ln";
}

} // namespace lluna::functions
