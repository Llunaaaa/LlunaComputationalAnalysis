#pragma once

#include <cmath>
#include <string>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <stdexcept>
#include <limits>
#include <utility>

namespace lluna::core {

class NumberValue {
public:
    enum class Representation {
        Standard,   // Stored as exact double
        Scientific  // Magnitude exceeds double limits: mantissa_ * 10^exponent_
    };

    Representation repr_ = Representation::Standard;
    double value_ = 0.0;
    double mantissa_ = 0.0;
    long long exponent_ = 0;
    bool is_approximate = false;
    std::string exact_repr = "";

    NumberValue() = default;

    explicit NumberValue(double val, bool approx = false, const std::string& exact = "")
        : repr_(Representation::Standard), value_(val), is_approximate(approx), exact_repr(exact) {
        if (!std::isfinite(val)) {
            throw std::runtime_error("The result is not finite");
        }
    }

    static NumberValue from_scientific(double man, long long exp, bool approx = false, const std::string& exact = "") {
        NumberValue nv;
        nv.repr_ = Representation::Scientific;
        nv.mantissa_ = man;
        nv.exponent_ = exp;
        nv.is_approximate = approx;
        nv.exact_repr = exact;
        nv.normalize();
        return nv;
    }

    void normalize() {
        if (repr_ != Representation::Scientific) return;
        if (mantissa_ == 0.0) {
            exponent_ = 0;
            value_ = 0.0;
            repr_ = Representation::Standard;
            return;
        }
        double sign = mantissa_ < 0.0 ? -1.0 : 1.0;
        double abs_man = std::fabs(mantissa_);
        while (abs_man >= 10.0) {
            abs_man /= 10.0;
            exponent_++;
        }
        while (abs_man < 1.0 && abs_man > 0.0) {
            abs_man *= 10.0;
            exponent_--;
        }
        mantissa_ = sign * abs_man;

        // If exponent is within standard double range (-300 to 300), convert back to exact double
        if (exponent_ >= -300 && exponent_ <= 300) {
            value_ = mantissa_ * std::pow(10.0, exponent_);
            repr_ = Representation::Standard;
        }
    }

    bool is_large() const {
        return repr_ == Representation::Scientific;
    }

    bool is_negative() const {
        return (repr_ == Representation::Standard) ? (value_ < 0.0) : (mantissa_ < 0.0);
    }

    bool is_zero() const {
        return (repr_ == Representation::Standard) ? (value_ == 0.0) : (mantissa_ == 0.0);
    }

    double mantissa() const {
        return (repr_ == Representation::Standard) ? to_scientific().first : mantissa_;
    }

    long long exponent() const {
        return (repr_ == Representation::Standard) ? to_scientific().second : exponent_;
    }

    double to_double() const {
        if (repr_ == Representation::Standard) {
            return value_;
        }
        if (mantissa_ == 0.0) return 0.0;
        if (exponent_ > 308) {
            return mantissa_ > 0 ? std::numeric_limits<double>::infinity()
                                 : -std::numeric_limits<double>::infinity();
        }
        if (exponent_ < -308) return 0.0;
        return mantissa_ * std::pow(10.0, exponent_);
    }

    std::pair<double, long long> to_scientific() const {
        if (repr_ == Representation::Scientific) {
            return {mantissa_, exponent_};
        }
        if (value_ == 0.0) {
            return {0.0, 0};
        }
        double sign = value_ < 0.0 ? -1.0 : 1.0;
        double abs_val = std::fabs(value_);
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
        return {sign * man, exp};
    }

    bool is_integer() const {
        if (repr_ == Representation::Scientific) {
            return exponent_ >= 0;
        }
        if (!std::isfinite(value_)) return false;
        if (value_ == std::floor(value_)) return true;
        return std::fabs(value_ - std::round(value_)) < 1e-11;
    }

    long long to_integer() const {
        if (!is_integer()) {
            throw std::runtime_error("Value is not an integer");
        }
        double d = to_double();
        return static_cast<long long>(std::round(d));
    }

    void negate() {
        if (repr_ == Representation::Scientific) {
            mantissa_ = -mantissa_;
        } else {
            value_ = -value_;
        }
    }

    std::string format() const {
        if (repr_ == Representation::Standard) {
            if (value_ == 0.0) return "0";
            double abs_val = std::fabs(value_);
            if (value_ == std::floor(value_) && abs_val < 1e15) {
                return std::to_string(static_cast<long long>(value_));
            }
            char buf[64];
            std::snprintf(buf, sizeof(buf), "%.15g", value_);
            return buf;
        }

        char buf[64];
        std::snprintf(buf, sizeof(buf), "%.15ge%+lld", mantissa_, exponent_);
        return buf;
    }
};

inline NumberValue add(const NumberValue& a, const NumberValue& b) {
    if (!a.is_large() && !b.is_large()) {
        double s = a.value_ + b.value_;
        if (std::isfinite(s)) {
            return NumberValue(s, a.is_approximate || b.is_approximate);
        }
    }

    auto [m1, e1] = a.to_scientific();
    auto [m2, e2] = b.to_scientific();
    if (m1 == 0.0) return b;
    if (m2 == 0.0) return a;

    long long exp_diff = e1 - e2;
    if (exp_diff > 16) return a;
    if (exp_diff < -16) return b;

    double m2_scaled = m2 * std::pow(10.0, -exp_diff);
    double new_m = m1 + m2_scaled;
    return NumberValue::from_scientific(new_m, e1, a.is_approximate || b.is_approximate);
}

inline NumberValue subtract(const NumberValue& a, const NumberValue& b) {
    NumberValue neg_b = b;
    if (neg_b.is_large()) {
        neg_b.mantissa_ = -neg_b.mantissa_;
    } else {
        neg_b.value_ = -neg_b.value_;
    }
    return add(a, neg_b);
}

inline NumberValue multiply(const NumberValue& a, const NumberValue& b) {
    if (!a.is_large() && !b.is_large()) {
        double p = a.value_ * b.value_;
        if (std::isfinite(p)) {
            return NumberValue(p, a.is_approximate || b.is_approximate);
        }
    }

    auto [m1, e1] = a.to_scientific();
    auto [m2, e2] = b.to_scientific();
    if (m1 == 0.0 || m2 == 0.0) return NumberValue(0.0, false);

    if ((e2 > 0 && e1 > std::numeric_limits<long long>::max() - e2) ||
        (e2 < 0 && e1 < std::numeric_limits<long long>::min() - e2)) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }

    double new_m = m1 * m2;
    long long new_e = e1 + e2;
    return NumberValue::from_scientific(new_m, new_e, a.is_approximate || b.is_approximate);
}

inline NumberValue divide(const NumberValue& a, const NumberValue& b) {
    if (!b.is_large() && b.value_ == 0.0) {
        throw std::runtime_error("Cannot divide by zero");
    }
    if (b.is_large() && b.mantissa_ == 0.0) {
        throw std::runtime_error("Cannot divide by zero");
    }

    if (!a.is_large() && !b.is_large()) {
        double q = a.value_ / b.value_;
        if (std::isfinite(q)) {
            bool approx = a.is_approximate || b.is_approximate;
            if (a.is_integer() && b.is_integer() && std::fmod(a.value_, b.value_) != 0.0) {
                approx = true;
            }
            return NumberValue(q, approx);
        }
    }

    auto [m1, e1] = a.to_scientific();
    auto [m2, e2] = b.to_scientific();

    if ((e2 < 0 && e1 > std::numeric_limits<long long>::max() + e2) ||
        (e2 > 0 && e1 < std::numeric_limits<long long>::min() + e2)) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }

    double new_m = m1 / m2;
    long long new_e = e1 - e2;
    return NumberValue::from_scientific(new_m, new_e, a.is_approximate || b.is_approximate);
}

inline NumberValue power(const NumberValue& a, const NumberValue& b) {
    if (!b.is_large() && b.value_ == 0.0) {
        return NumberValue(1.0, false);
    }
    if (!a.is_large() && a.value_ == 0.0) {
        if (!b.is_large() && b.value_ < 0.0) throw std::runtime_error("Cannot divide by zero");
        return NumberValue(0.0, false);
    }

    // Protective limit against massive exponentiation (e.g. 9^(100000!))
    if (b.is_large() && (b.exponent_ > 18 || b.exponent_ < -18)) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }

    if (!a.is_large() && !b.is_large()) {
        if (a.value_ < 0.0 && !b.is_integer()) {
            throw std::runtime_error("Negative base with non-integer exponent");
        }
        double res = std::pow(a.value_, b.value_);
        if (std::isfinite(res)) {
            bool approx = a.is_approximate || b.is_approximate || !b.is_integer();
            return NumberValue(res, approx);
        }
    }

    auto [m1, e1] = a.to_scientific();
    if (m1 < 0.0) {
        if (!b.is_integer()) {
            throw std::runtime_error("Negative base with non-integer exponent");
        }
        NumberValue abs_a = a;
        abs_a.value_ = std::fabs(a.value_);
        abs_a.mantissa_ = std::fabs(a.mantissa_);
        auto res = power(abs_a, b);
        long long b_int = static_cast<long long>(b.to_double());
        if (b_int % 2 != 0) {
            if (res.is_large()) res.mantissa_ = -res.mantissa_;
            else res.value_ = -res.value_;
        }
        return res;
    }

    double log10_a = std::log10(m1) + static_cast<double>(e1);
    double b_val = b.to_double();
    double total_log = b_val * log10_a;

    if (!std::isfinite(total_log) ||
        total_log > static_cast<double>(std::numeric_limits<long long>::max()) - 1000.0 ||
        total_log < static_cast<double>(std::numeric_limits<long long>::min()) + 1000.0) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }

    long long new_e = static_cast<long long>(std::floor(total_log));
    double rem = total_log - static_cast<double>(new_e);
    double new_m = std::pow(10.0, rem);
    bool approx = a.is_approximate || b.is_approximate || !b.is_integer();
    return NumberValue::from_scientific(new_m, new_e, approx);
}

} // namespace lluna::core
