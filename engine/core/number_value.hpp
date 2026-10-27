#pragma once

#include <cmath>
#include <string>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <stdexcept>
#include <limits>

namespace lluna::core {

struct NumberValue {
    double mantissa = 0.0;    // Standard: 1.0 <= |mantissa| < 10.0, or 0.0
    long long exponent = 0;   // Base 10 exponent
    bool is_approximate = false;
    std::string exact_repr = "";

    NumberValue() = default;

    NumberValue(double val, bool approx = false, const std::string& exact = "")
        : is_approximate(approx), exact_repr(exact) {
        if (!std::isfinite(val)) {
            throw std::runtime_error("The result is not finite");
        }
        if (val == 0.0) {
            mantissa = 0.0;
            exponent = 0;
            return;
        }
        double sign = val < 0.0 ? -1.0 : 1.0;
        double abs_val = std::fabs(val);
        long long exp = static_cast<long long>(std::floor(std::log10(abs_val)));
        double man = abs_val / std::pow(10.0, exp);
        while (man >= 10.0) {
            man /= 10.0;
            exp++;
        }
        while (man < 1.0 && man > 0.0) {
            man *= 10.0;
            exp--;
        }
        mantissa = sign * man;
        exponent = exp;
    }

    static NumberValue from_scientific(double man, long long exp, bool approx = false, const std::string& exact = "") {
        NumberValue nv;
        nv.mantissa = man;
        nv.exponent = exp;
        nv.is_approximate = approx;
        nv.exact_repr = exact;
        nv.normalize();
        return nv;
    }

    void normalize() {
        if (mantissa == 0.0) {
            exponent = 0;
            return;
        }
        double sign = mantissa < 0.0 ? -1.0 : 1.0;
        double abs_man = std::fabs(mantissa);
        while (abs_man >= 10.0) {
            abs_man /= 10.0;
            exponent++;
        }
        while (abs_man < 1.0 && abs_man > 0.0) {
            abs_man *= 10.0;
            exponent--;
        }
        mantissa = sign * abs_man;
    }

    double to_double() const {
        if (mantissa == 0.0) return 0.0;
        if (exponent > 308) return mantissa > 0 ? std::numeric_limits<double>::infinity() : -std::numeric_limits<double>::infinity();
        if (exponent < -308) return 0.0;
        return mantissa * std::pow(10.0, exponent);
    }

    bool is_integer() const {
        if (mantissa == 0.0) return true;
        if (exponent < 0) return false;
        if (exponent >= 15) return true;
        double d = to_double();
        return std::isfinite(d) && d == std::floor(d);
    }

    std::string format() const {
        if (mantissa == 0.0) return "0";

        if (exponent >= 0 && exponent <= 12) {
            double val = to_double();
            if (val == std::floor(val)) {
                return std::to_string(static_cast<long long>(val));
            }
            char buf[64];
            std::snprintf(buf, sizeof(buf), "%.15g", val);
            return buf;
        }
        if (exponent >= -4 && exponent < 0) {
            double val = to_double();
            char buf[64];
            std::snprintf(buf, sizeof(buf), "%.15g", val);
            return buf;
        }

        char buf[64];
        std::snprintf(buf, sizeof(buf), "%.15ge%+lld", mantissa, exponent);
        return buf;
    }
};

inline NumberValue add(const NumberValue& a, const NumberValue& b) {
    if (a.mantissa == 0.0) return b;
    if (b.mantissa == 0.0) return a;
    long long exp_diff = a.exponent - b.exponent;
    if (exp_diff > 16) return a;
    if (exp_diff < -16) return b;
    double b_scaled = b.mantissa * std::pow(10.0, -exp_diff);
    double new_man = a.mantissa + b_scaled;
    return NumberValue::from_scientific(new_man, a.exponent, a.is_approximate || b.is_approximate);
}

inline NumberValue subtract(const NumberValue& a, const NumberValue& b) {
    NumberValue neg_b = b;
    neg_b.mantissa = -neg_b.mantissa;
    return add(a, neg_b);
}

inline NumberValue multiply(const NumberValue& a, const NumberValue& b) {
    if (a.mantissa == 0.0 || b.mantissa == 0.0) return NumberValue(0.0, false);
    if ((b.exponent > 0 && a.exponent > std::numeric_limits<long long>::max() - b.exponent) ||
        (b.exponent < 0 && a.exponent < std::numeric_limits<long long>::min() - b.exponent)) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }
    double new_man = a.mantissa * b.mantissa;
    long long new_exp = a.exponent + b.exponent;
    return NumberValue::from_scientific(new_man, new_exp, a.is_approximate || b.is_approximate);
}

inline NumberValue divide(const NumberValue& a, const NumberValue& b) {
    if (b.mantissa == 0.0) {
        throw std::runtime_error("Cannot divide by zero");
    }
    if ((b.exponent < 0 && a.exponent > std::numeric_limits<long long>::max() + b.exponent) ||
        (b.exponent > 0 && a.exponent < std::numeric_limits<long long>::min() + b.exponent)) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }
    double new_man = a.mantissa / b.mantissa;
    long long new_exp = a.exponent - b.exponent;
    bool is_approx = a.is_approximate || b.is_approximate;
    if (a.is_integer() && b.is_integer()) {
        double da = a.to_double();
        double db = b.to_double();
        if (std::isfinite(da) && std::isfinite(db) && std::fmod(da, db) != 0.0) {
            is_approx = true;
        }
    }
    return NumberValue::from_scientific(new_man, new_exp, is_approx);
}

inline NumberValue power(const NumberValue& a, const NumberValue& b) {
    if (b.mantissa == 0.0) {
        return NumberValue(1.0, false);
    }
    if (a.mantissa == 0.0) {
        if (b.mantissa < 0.0) throw std::runtime_error("Cannot divide by zero");
        return NumberValue(0.0, false);
    }
    if (a.mantissa < 0.0) {
        if (!b.is_integer()) {
            throw std::runtime_error("Negative base with non-integer exponent");
        }
        NumberValue abs_a = a;
        abs_a.mantissa = -abs_a.mantissa;
        auto res = power(abs_a, b);
        long long b_int = static_cast<long long>(b.to_double());
        if (b_int % 2 != 0) {
            res.mantissa = -res.mantissa;
        }
        return res;
    }
    // Protective limit against massive chained exponentiation (e.g. 9^(100000!))
    if (b.exponent > 18 || b.exponent < -18) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }
    double log10_a = std::log10(a.mantissa) + static_cast<double>(a.exponent);
    double b_val = b.to_double();
    double total_log = b_val * log10_a;
    if (!std::isfinite(total_log) ||
        total_log > static_cast<double>(std::numeric_limits<long long>::max()) - 1000.0 ||
        total_log < static_cast<double>(std::numeric_limits<long long>::min()) + 1000.0) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }
    long long new_exp = static_cast<long long>(std::floor(total_log));
    double rem_exp = total_log - static_cast<double>(new_exp);
    double new_man = std::pow(10.0, rem_exp);
    bool is_approx = a.is_approximate || b.is_approximate || !b.is_integer();
    return NumberValue::from_scientific(new_man, new_exp, is_approx);
}

} // namespace lluna::core
