#pragma once

#include "../constants/constants.hpp"
#include <algorithm>
#include <cfloat>
#include <cmath>
#include <cstdio>
#include <limits>
#include <numeric>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>

namespace lluna::core {

inline constexpr const char* kUnreasonableComputation =
    "Operation requires an unreasonable amount of computational power";

// Raised when a result no longer fits the exact 64-bit rational representation.
// Arithmetic catches it and continues in scientific floating point, so it only
// reaches the user when no approximate continuation exists.
struct RationalOverflow : std::runtime_error {
    RationalOverflow() : std::runtime_error(kUnreasonableComputation) {}
};

inline long long checked_add(long long left, long long right) {
    if ((right > 0 && left > std::numeric_limits<long long>::max() - right) ||
        (right < 0 && left < std::numeric_limits<long long>::min() - right)) {
        throw RationalOverflow();
    }
    return left + right;
}

inline long long checked_multiply(long long left, long long right) {
    if (left == 0 || right == 0) return 0;
    constexpr long long max = std::numeric_limits<long long>::max();
    constexpr long long min = std::numeric_limits<long long>::min();
    if ((left == -1 && right == min) || (right == -1 && left == min)) throw RationalOverflow();
    if (left > 0) {
        if (right > 0 ? left > max / right : right < min / left) throw RationalOverflow();
    } else {
        if (right > 0 ? left < min / right : left < max / right) throw RationalOverflow();
    }
    return left * right;
}

struct Rational {
    long long num = 0;
    long long den = 1;

    Rational() = default;
    Rational(long long n) : num(n), den(1) {}
    Rational(long long n, long long d) : num(n), den(d) { normalize(); }

    void normalize() {
        if (den == 0) throw std::runtime_error("Cannot divide by zero");
        if (num == std::numeric_limits<long long>::min() ||
            den == std::numeric_limits<long long>::min()) {
            throw RationalOverflow();
        }
        if (den < 0) { num = -num; den = -den; }
        if (num == 0) { den = 1; return; }
        const long long g = std::gcd(num < 0 ? -num : num, den);
        num /= g;
        den /= g;
    }

    bool is_integer() const { return den == 1; }
    bool is_zero() const { return num == 0; }
    bool is_one() const { return num == 1 && den == 1; }
    bool is_negative() const { return num < 0; }
    double to_double() const { return static_cast<double>(num) / static_cast<double>(den); }
};

inline Rational operator+(Rational a, Rational b) {
    const long long g = std::gcd(a.den, b.den);
    const long long left_scale = b.den / g;
    const long long right_scale = a.den / g;
    return Rational(checked_add(checked_multiply(a.num, left_scale), checked_multiply(b.num, right_scale)),
                    checked_multiply(a.den, left_scale));
}

inline Rational operator*(Rational a, Rational b) {
    const long long g1 = std::gcd(a.num < 0 ? -a.num : a.num, b.den);
    const long long g2 = std::gcd(b.num < 0 ? -b.num : b.num, a.den);
    return Rational(checked_multiply(a.num / g1, b.num / g2), checked_multiply(a.den / g2, b.den / g1));
}

inline Rational reciprocal(Rational value) {
    if (value.num == 0) throw std::runtime_error("Cannot divide by zero");
    return Rational(value.den, value.num);
}

inline Rational operator-(Rational a, Rational b) { return a + Rational(-b.num, b.den); }
inline Rational operator/(Rational a, Rational b) { return a * reciprocal(b); }

inline Rational rational_pow(Rational base, unsigned long long exponent) {
    Rational result(1);
    while (exponent > 0) {
        if (exponent & 1ULL) result = result * base;
        exponent >>= 1;
        if (exponent > 0) base = base * base;
    }
    return result;
}

inline long long isqrt_floor(long long value) {
    long long root = static_cast<long long>(std::sqrt(static_cast<double>(value)));
    while (root > 0 && root > value / root) --root;
    while (root + 1 <= value / (root + 1)) ++root;
    return root;
}

// Integer n-th root when value is a perfect n-th power.
inline std::optional<long long> exact_integer_root(long long value, long long n) {
    if (value < 0 || n < 1) return std::nullopt;
    if (value < 2 || n == 1) return value;
    const long long guess = std::llround(std::pow(static_cast<double>(value), 1.0 / static_cast<double>(n)));
    for (long long candidate = std::max(1LL, guess - 1); candidate <= guess + 1; ++candidate) {
        try {
            if (rational_pow(Rational(candidate), static_cast<unsigned long long>(n)).num == value) return candidate;
        } catch (const RationalOverflow&) {
            return std::nullopt;
        }
    }
    return std::nullopt;
}

// Splits n = square^2 * free_part with free_part square-free. After trial division
// up to cbrt(rest), the cofactor has at most two prime factors, so a single
// perfect-square test finishes the factorization without an O(sqrt n) scan.
inline std::pair<long long, long long> simplify_sqrt(long long n) {
    if (n <= 0) return {0, 0};
    long long square = 1;
    long long free_part = 1;
    long long rest = n;
    for (long long factor = 2; factor <= rest / factor / factor; ++factor) {
        if (rest % factor != 0) continue;
        int count = 0;
        while (rest % factor == 0) {
            rest /= factor;
            ++count;
        }
        for (int i = 0; i < count / 2; ++i) square *= factor;
        if (count % 2 != 0) free_part *= factor;
    }
    const long long root = isqrt_floor(rest);
    if (rest > 1 && root * root == rest) square *= root;
    else free_part *= rest;
    return {square, free_part};
}

inline std::pair<bool, long long> check_integer_log(long long base, long long val) {
    if (base <= 1 || val <= 0) return {false, 0};
    long long power = 0;
    long long current = 1;
    while (current < val) {
        if (current > std::numeric_limits<long long>::max() / base) return {false, 0};
        current *= base;
        ++power;
    }
    return {current == val, current == val ? power : 0};
}

enum class ValueKind {
    ExactRational,
    ExactRadical,    // q * sqrt(r) where r is a square-free integer > 1
    ExactConstant,   // q * pi^k * e^m
    RealApprox       // floating point; huge/tiny magnitudes use mantissa * 10^sci_exp
};

class NumberValue {
public:
    ValueKind kind = ValueKind::ExactRational;
    Rational rat;
    long long radical = 1;
    int pi_exp = 0;
    int e_exp = 0;
    double real_val = 0.0;
    long long sci_exp = 0;
    std::string symbol;        // display name of a named irrational constant such as ϕ
    bool has_rational_hint = false;
    Rational rational_hint;    // exact form recognised for a numerical result

    NumberValue() = default;
    NumberValue(int n) : rat(static_cast<long long>(n)) {}
    NumberValue(long long n) : rat(n) {}
    NumberValue(Rational r) : rat(r) {}

    NumberValue(double val, bool approx = false, std::string name = "") : symbol(std::move(name)) {
        if (!std::isfinite(val)) throw std::runtime_error("The result is not finite");
        if (!approx && val == std::floor(val) && std::fabs(val) < 9e15) {
            rat = Rational(static_cast<long long>(val));
        } else {
            kind = ValueKind::RealApprox;
            real_val = val;
        }
    }

    static NumberValue from_literal(const std::string& text, double fallback_val) {
        if (text.find_first_of("eE") != std::string::npos) return NumberValue(fallback_val);
        const size_t dot = text.find('.');
        try {
            if (dot == std::string::npos) return NumberValue(std::stoll(text));
            const std::string whole = text.substr(0, dot);
            const std::string fraction = text.substr(dot + 1);
            if (fraction.size() > 15 || text.size() > 18) return NumberValue(fallback_val);
            long long den = 1;
            for (size_t i = 0; i < fraction.size(); ++i) den *= 10;
            const long long integer = whole.empty() ? 0 : std::stoll(whole);
            const long long fractional = fraction.empty() ? 0 : std::stoll(fraction);
            return NumberValue(Rational(checked_add(checked_multiply(integer, den), fractional), den));
        } catch (...) {
            return NumberValue(fallback_val);
        }
    }

    static NumberValue make_pi() {
        NumberValue v(Rational(1));
        v.kind = ValueKind::ExactConstant;
        v.pi_exp = 1;
        return v;
    }

    static NumberValue make_e() {
        NumberValue v(Rational(1));
        v.kind = ValueKind::ExactConstant;
        v.e_exp = 1;
        return v;
    }

    static NumberValue make_sqrt(Rational arg) {
        if (arg.num < 0) throw std::runtime_error("Cannot take the square root of a negative value");
        if (arg.num == 0) return NumberValue(0);
        // sqrt(p/q) = sqrt(p*q)/q
        const auto [square, free_part] = simplify_sqrt(checked_multiply(arg.num, arg.den));
        const Rational coefficient(square, arg.den);
        if (free_part == 1) return NumberValue(coefficient);
        return make_radical(coefficient, free_part);
    }

    static NumberValue make_radical(Rational coefficient, long long free_part) {
        if (coefficient.is_zero()) return NumberValue(0);
        if (free_part == 1) return NumberValue(coefficient);
        NumberValue v(coefficient);
        v.kind = ValueKind::ExactRadical;
        v.radical = free_part;
        return v;
    }

    static NumberValue make_constant(Rational coefficient, long long pi_power, long long e_power) {
        if (coefficient.is_zero()) return NumberValue(0);
        if (pi_power == 0 && e_power == 0) return NumberValue(coefficient);
        constexpr long long limit = std::numeric_limits<int>::max();
        if (std::llabs(pi_power) > limit || std::llabs(e_power) > limit) throw RationalOverflow();
        NumberValue v(coefficient);
        v.kind = ValueKind::ExactConstant;
        v.pi_exp = static_cast<int>(pi_power);
        v.e_exp = static_cast<int>(e_power);
        return v;
    }

    static NumberValue make_approx(double val) {
        if (!std::isfinite(val)) throw std::runtime_error("The result is not finite");
        NumberValue v;
        v.kind = ValueKind::RealApprox;
        v.real_val = val;
        return v;
    }

    static NumberValue make_approx_with_rational(double val, Rational rational) {
        NumberValue value = make_approx(val);
        value.has_rational_hint = true;
        value.rational_hint = rational;
        return value;
    }

    static NumberValue from_scientific(double mantissa, long long exponent) {
        if (!std::isfinite(mantissa)) throw std::runtime_error("The result is not finite");
        NumberValue v;
        v.kind = ValueKind::RealApprox;
        v.real_val = mantissa;
        v.sci_exp = exponent;
        v.normalize_scientific();
        return v;
    }

    void normalize_scientific() {
        if (real_val == 0.0) {
            sci_exp = 0;
            return;
        }
        const long long shift = static_cast<long long>(std::floor(std::log10(std::fabs(real_val))));
        real_val /= std::pow(10.0, static_cast<double>(shift));
        sci_exp += shift;
        // log10 rounding can leave the mantissa one decade off.
        if (std::fabs(real_val) >= 10.0) { real_val /= 10.0; ++sci_exp; }
        if (std::fabs(real_val) < 1.0) { real_val *= 10.0; --sci_exp; }
    }

    const Rational* rational_form() const {
        if (kind == ValueKind::ExactRational) return &rat;
        return has_rational_hint ? &rational_hint : nullptr;
    }

    // Same exact kind with a different rational coefficient.
    NumberValue scaled(Rational coefficient) const {
        switch (kind) {
            case ValueKind::ExactRadical: return make_radical(coefficient, radical);
            case ValueKind::ExactConstant: return make_constant(coefficient, pi_exp, e_exp);
            default: return NumberValue(coefficient);
        }
    }

    bool is_exact() const { return kind == ValueKind::ExactRational; }
    bool is_approximate() const { return !is_exact(); }
    bool is_large() const { return kind == ValueKind::RealApprox && (sci_exp > 300 || sci_exp < -300); }

    bool is_negative() const {
        return kind == ValueKind::RealApprox ? real_val < 0.0 : rat.is_negative();
    }

    bool is_zero() const {
        return kind == ValueKind::RealApprox ? real_val == 0.0 : rat.is_zero();
    }

    bool is_integer() const {
        if (kind == ValueKind::ExactRational) return rat.is_integer();
        const double d = to_double();
        if (!std::isfinite(d)) return false;
        return std::fabs(d - std::round(d)) <= 1e-11 * std::max(1.0, std::fabs(d));
    }

    long long to_integer() const {
        if (!is_integer()) throw std::runtime_error("Value is not an integer");
        if (kind == ValueKind::ExactRational) return rat.num;
        const double value = std::round(to_double());
        if (value < -9.2e18 || value > 9.2e18) throw std::runtime_error("Integer result is out of range");
        return static_cast<long long>(value);
    }

    void negate() {
        if (kind == ValueKind::RealApprox) real_val = -real_val;
        else rat.num = -rat.num;
        if (has_rational_hint) rational_hint.num = -rational_hint.num;
        symbol.clear();
    }

    double to_double() const {
        switch (kind) {
            case ValueKind::ExactRational:
                return rat.to_double();
            case ValueKind::ExactRadical:
                return rat.to_double() * std::sqrt(static_cast<double>(radical));
            case ValueKind::ExactConstant:
                return rat.to_double() * std::pow(constants::kPi, pi_exp) * std::pow(constants::kE, e_exp);
            case ValueKind::RealApprox:
                return sci_exp == 0 ? real_val : real_val * std::pow(10.0, static_cast<double>(sci_exp));
        }
        return 0.0;
    }

    std::pair<double, long long> to_scientific() const {
        if (kind == ValueKind::RealApprox && sci_exp != 0) return {real_val, sci_exp};
        const double d = to_double();
        if (d == 0.0) return {0.0, 0};
        NumberValue normalized = from_scientific(d, 0);
        return {normalized.real_val, normalized.sci_exp};
    }

    double mantissa() const { return to_scientific().first; }
    long long exponent() const { return to_scientific().second; }

    // Exact symbolic form in the engine's own input language, or "" when the
    // value is a plain approximation.
    std::string exact_string() const {
        switch (kind) {
            case ValueKind::ExactRational:
                return rational_string(rat);
            case ValueKind::ExactRadical:
                return scaled_string(rat, "sqrt(" + std::to_string(radical) + ")", "");
            case ValueKind::ExactConstant: {
                std::string numerator;
                std::string denominator;
                append_power(pi_exp > 0 ? numerator : denominator, "π", std::abs(pi_exp));
                append_power(e_exp > 0 ? numerator : denominator, "e", std::abs(e_exp));
                return scaled_string(rat, numerator, denominator);
            }
            case ValueKind::RealApprox:
                return has_rational_hint ? rational_string(rational_hint) : symbol;
        }
        return "";
    }

    std::string format() const {
        if (kind == ValueKind::ExactRational && rat.is_integer() && std::llabs(rat.num) <= 10000000000000000LL) {
            return std::to_string(rat.num);
        }

        const auto [man, exp] = to_scientific();
        if (man == 0.0) return "0";

        char buf[64];
        if (exp > 16 || exp < -6) {
            std::snprintf(buf, sizeof(buf), "%.15ge%+lld", man, exp);
            return buf;
        }

        const double val = to_double();
        if (val == std::floor(val) && std::fabs(val) < 1e16) {
            return std::to_string(static_cast<long long>(val));
        }
        std::snprintf(buf, sizeof(buf), "%.15g", val);
        std::string s(buf);
        if (s.find_first_of("eE") != std::string::npos) {
            std::snprintf(buf, sizeof(buf), "%.*f", static_cast<int>(std::max(0LL, 15 - exp)), val);
            s = buf;
            if (s.find('.') != std::string::npos) {
                s.erase(s.find_last_not_of('0') + 1);
                if (s.back() == '.') s.pop_back();
            }
        }
        return s;
    }

private:
    static std::string rational_string(const Rational& value) {
        return value.is_integer() ? std::to_string(value.num)
                                  : std::to_string(value.num) + "/" + std::to_string(value.den);
    }

    static void append_power(std::string& target, const char* name, int power) {
        if (power == 0) return;
        target += name;
        if (power != 1) target += "^" + std::to_string(power);
    }

    // coefficient * numerator_factors / denominator_factors, e.g. "2π/3" or "sqrt(2)/2".
    static std::string scaled_string(const Rational& coefficient, const std::string& numerator_factors,
                                     const std::string& denominator_factors) {
        std::string out = coefficient.is_negative() ? "-" : "";
        const long long magnitude = std::llabs(coefficient.num);
        if (magnitude != 1 || numerator_factors.empty()) out += std::to_string(magnitude);
        out += numerator_factors;

        std::string denominator = coefficient.den == 1 ? "" : std::to_string(coefficient.den);
        denominator += denominator_factors;
        if (denominator.empty()) return out;
        const bool single_factor = coefficient.den == 1
            ? denominator_factors.find_first_of("^") == std::string::npos && denominator_factors.size() <= 2
            : denominator_factors.empty();
        return out + "/" + (single_factor ? denominator : "(" + denominator + ")");
    }
};

namespace detail {

inline long long checked_exponent_sum(long long left, long long right) {
    if ((right > 0 && left > std::numeric_limits<long long>::max() - right) ||
        (right < 0 && left < std::numeric_limits<long long>::min() - right)) {
        throw std::runtime_error(kUnreasonableComputation);
    }
    return left + right;
}

inline bool fits_double(double value) {
    return std::isfinite(value) && (value == 0.0 || std::fabs(value) >= DBL_MIN);
}

// Floating-point arithmetic that transparently switches to mantissa/exponent
// form once a result leaves the double range.
inline NumberValue approx_add(const NumberValue& a, const NumberValue& b) {
    if (!a.is_large() && !b.is_large()) {
        const double sum = a.to_double() + b.to_double();
        if (std::isfinite(sum)) return NumberValue::make_approx(sum);
    }
    auto [m1, e1] = a.to_scientific();
    auto [m2, e2] = b.to_scientific();
    if (m1 == 0.0) return NumberValue::from_scientific(m2, e2);
    if (m2 == 0.0) return NumberValue::from_scientific(m1, e1);
    if (e1 < e2) { std::swap(m1, m2); std::swap(e1, e2); }
    const long long gap = e1 - e2;
    if (gap > 17) return NumberValue::from_scientific(m1, e1);
    return NumberValue::from_scientific(m1 + m2 * std::pow(10.0, -static_cast<double>(gap)), e1);
}

inline NumberValue approx_multiply(const NumberValue& a, const NumberValue& b) {
    if (!a.is_large() && !b.is_large()) {
        const double product = a.to_double() * b.to_double();
        if (fits_double(product) && product != 0.0) return NumberValue::make_approx(product);
    }
    const auto [m1, e1] = a.to_scientific();
    const auto [m2, e2] = b.to_scientific();
    return NumberValue::from_scientific(m1 * m2, checked_exponent_sum(e1, e2));
}

inline NumberValue approx_divide(const NumberValue& a, const NumberValue& b) {
    if (!a.is_large() && !b.is_large()) {
        const double quotient = a.to_double() / b.to_double();
        if (fits_double(quotient) && quotient != 0.0) return NumberValue::make_approx(quotient);
    }
    const auto [m1, e1] = a.to_scientific();
    const auto [m2, e2] = b.to_scientific();
    if (e2 == std::numeric_limits<long long>::min()) throw std::runtime_error(kUnreasonableComputation);
    return NumberValue::from_scientific(m1 / m2, checked_exponent_sum(e1, -e2));
}

inline NumberValue with_rational_hint(double value, const Rational& left, const Rational& right, char op) {
    try {
        switch (op) {
            case '+': return NumberValue::make_approx_with_rational(value, left + right);
            case '*': return NumberValue::make_approx_with_rational(value, left * right);
            default: return NumberValue::make_approx_with_rational(value, left / right);
        }
    } catch (const RationalOverflow&) {
        return NumberValue::make_approx(value);
    }
}

} // namespace detail

inline NumberValue add(const NumberValue& a, const NumberValue& b) {
    if (a.kind == ValueKind::ExactRational && a.rat.is_zero()) return b;
    if (b.kind == ValueKind::ExactRational && b.rat.is_zero()) return a;
    try {
        if (a.kind == b.kind) {
            const bool like_terms =
                a.kind == ValueKind::ExactRational ||
                (a.kind == ValueKind::ExactRadical && a.radical == b.radical) ||
                (a.kind == ValueKind::ExactConstant && a.pi_exp == b.pi_exp && a.e_exp == b.e_exp);
            if (like_terms) return a.scaled(a.rat + b.rat);
        }
    } catch (const RationalOverflow&) {
        return detail::approx_add(a, b);
    }
    const Rational* left = a.rational_form();
    const Rational* right = b.rational_form();
    if (left && right) {
        NumberValue sum = detail::approx_add(a, b);
        if (sum.is_large()) return sum;
        return detail::with_rational_hint(sum.to_double(), *left, *right, '+');
    }
    return detail::approx_add(a, b);
}

inline NumberValue subtract(const NumberValue& a, const NumberValue& b) {
    NumberValue negated = b;
    negated.negate();
    return add(a, negated);
}

inline NumberValue multiply(const NumberValue& a, const NumberValue& b) {
    if (a.is_zero() || b.is_zero()) return NumberValue(0);
    try {
        if (a.kind == ValueKind::ExactRational && b.kind != ValueKind::RealApprox) return b.scaled(a.rat * b.rat);
        if (b.kind == ValueKind::ExactRational && a.kind != ValueKind::RealApprox) return a.scaled(a.rat * b.rat);
        if (a.kind == ValueKind::ExactConstant && b.kind == ValueKind::ExactConstant) {
            return NumberValue::make_constant(a.rat * b.rat, static_cast<long long>(a.pi_exp) + b.pi_exp,
                                              static_cast<long long>(a.e_exp) + b.e_exp);
        }
        if (a.kind == ValueKind::ExactRadical && b.kind == ValueKind::ExactRadical) {
            const auto [square, free_part] = simplify_sqrt(checked_multiply(a.radical, b.radical));
            return NumberValue::make_radical(a.rat * b.rat * Rational(square), free_part);
        }
    } catch (const RationalOverflow&) {
        return detail::approx_multiply(a, b);
    }
    const Rational* left = a.rational_form();
    const Rational* right = b.rational_form();
    if (left && right) {
        NumberValue product = detail::approx_multiply(a, b);
        if (product.is_large()) return product;
        return detail::with_rational_hint(product.to_double(), *left, *right, '*');
    }
    return detail::approx_multiply(a, b);
}

inline NumberValue divide(const NumberValue& a, const NumberValue& b) {
    if (b.is_zero()) throw std::runtime_error("Cannot divide by zero");
    if (a.is_zero()) return NumberValue(0);
    try {
        if (b.kind == ValueKind::ExactRational && a.kind != ValueKind::RealApprox) return a.scaled(a.rat / b.rat);
        if (a.kind == ValueKind::ExactRational && b.kind == ValueKind::ExactConstant) {
            return NumberValue::make_constant(a.rat / b.rat, -static_cast<long long>(b.pi_exp),
                                              -static_cast<long long>(b.e_exp));
        }
        if (a.kind == ValueKind::ExactConstant && b.kind == ValueKind::ExactConstant) {
            return NumberValue::make_constant(a.rat / b.rat, static_cast<long long>(a.pi_exp) - b.pi_exp,
                                              static_cast<long long>(a.e_exp) - b.e_exp);
        }
        // q / (c*sqrt(r)) = (q / (c*r)) * sqrt(r)
        if (a.kind == ValueKind::ExactRational && b.kind == ValueKind::ExactRadical) {
            return NumberValue::make_radical(a.rat / (b.rat * Rational(b.radical)), b.radical);
        }
        // (a*sqrt(r)) / (b*sqrt(s)) = (a / (b*s)) * sqrt(r*s)
        if (a.kind == ValueKind::ExactRadical && b.kind == ValueKind::ExactRadical) {
            if (a.radical == b.radical) return NumberValue(a.rat / b.rat);
            const auto [square, free_part] = simplify_sqrt(checked_multiply(a.radical, b.radical));
            return NumberValue::make_radical(a.rat / (b.rat * Rational(b.radical)) * Rational(square), free_part);
        }
    } catch (const RationalOverflow&) {
        return detail::approx_divide(a, b);
    }
    const Rational* left = a.rational_form();
    const Rational* right = b.rational_form();
    if (left && right && !right->is_zero()) {
        NumberValue quotient = detail::approx_divide(a, b);
        if (quotient.is_large()) return quotient;
        return detail::with_rational_hint(quotient.to_double(), *left, *right, '/');
    }
    return detail::approx_divide(a, b);
}

namespace detail {

inline std::optional<NumberValue> exact_integer_power(const NumberValue& base, long long exponent) {
    const unsigned long long magnitude = exponent < 0
        ? static_cast<unsigned long long>(-(exponent + 1)) + 1ULL
        : static_cast<unsigned long long>(exponent);
    switch (base.kind) {
        case ValueKind::ExactRational: {
            const Rational value = rational_pow(base.rat, magnitude);
            return NumberValue(exponent < 0 ? reciprocal(value) : value);
        }
        case ValueKind::ExactRadical: {
            // (c*sqrt(r))^n = c^n * r^(n/2) * sqrt(r)^(n mod 2)
            const Rational coefficient = rational_pow(base.rat, magnitude) * rational_pow(Rational(base.radical), magnitude / 2);
            if (magnitude % 2 == 0) return NumberValue(exponent < 0 ? reciprocal(coefficient) : coefficient);
            if (exponent > 0) return NumberValue::make_radical(coefficient, base.radical);
            return NumberValue::make_radical(reciprocal(coefficient * Rational(base.radical)), base.radical);
        }
        case ValueKind::ExactConstant: {
            if (magnitude > static_cast<unsigned long long>(std::numeric_limits<int>::max())) return std::nullopt;
            const Rational coefficient = rational_pow(base.rat, magnitude);
            return NumberValue::make_constant(exponent < 0 ? reciprocal(coefficient) : coefficient,
                                              static_cast<long long>(base.pi_exp) * exponent,
                                              static_cast<long long>(base.e_exp) * exponent);
        }
        case ValueKind::RealApprox:
            return std::nullopt;
    }
    return std::nullopt;
}

// base^(p/q) for rational base: exact when base is a perfect q-th power, or a
// radical when q == 2.
inline std::optional<NumberValue> exact_rational_power(const Rational& base, const Rational& exponent) {
    const long long q = exponent.den;
    if (q > 64) return std::nullopt;
    if (base.is_negative() && q % 2 == 0) return std::nullopt;
    const auto numerator_root = exact_integer_root(std::llabs(base.num), q);
    const auto denominator_root = exact_integer_root(base.den, q);
    if (numerator_root && denominator_root) {
        const Rational root(base.is_negative() ? -*numerator_root : *numerator_root, *denominator_root);
        return exact_integer_power(NumberValue(root), exponent.num);
    }
    if (q == 2) return exact_integer_power(NumberValue::make_sqrt(base), exponent.num);
    return std::nullopt;
}

inline NumberValue approx_power(const NumberValue& base, const NumberValue& exponent) {
    const auto [mantissa, decade] = base.to_scientific();
    double sign = 1.0;
    if (mantissa < 0.0) {
        if (exponent.is_integer()) {
            sign = std::fmod(std::fabs(std::round(exponent.to_double())), 2.0) == 1.0 ? -1.0 : 1.0;
        } else if (exponent.kind == ValueKind::ExactRational && exponent.rat.den % 2 != 0) {
            sign = exponent.rat.num % 2 != 0 ? -1.0 : 1.0;
        } else {
            throw std::runtime_error("Negative base with non-integer exponent");
        }
    }

    const double y = exponent.to_double();
    if (!base.is_large() && !exponent.is_large()) {
        const double direct = std::pow(std::fabs(base.to_double()), y);
        if (fits_double(direct) && direct != 0.0) return NumberValue::make_approx(sign * direct);
    }

    const double log10_result = y * (std::log10(std::fabs(mantissa)) + static_cast<double>(decade));
    if (!std::isfinite(log10_result) || std::fabs(log10_result) > 9.0e18) {
        throw std::runtime_error(kUnreasonableComputation);
    }
    const long long result_decade = static_cast<long long>(std::floor(log10_result));
    return NumberValue::from_scientific(sign * std::pow(10.0, log10_result - static_cast<double>(result_decade)),
                                        result_decade);
}

} // namespace detail

inline NumberValue power(const NumberValue& base, const NumberValue& exponent) {
    if (exponent.is_zero()) return NumberValue(1);
    if (base.is_zero()) {
        if (exponent.is_negative()) throw std::runtime_error("Cannot divide by zero");
        return NumberValue(0);
    }
    if (exponent.is_large()) {
        if (exponent.sci_exp > 0) throw std::runtime_error(kUnreasonableComputation);
        return NumberValue::make_approx(1.0);
    }

    if (exponent.kind == ValueKind::ExactRational) {
        try {
            const auto exact = exponent.rat.is_integer()
                ? detail::exact_integer_power(base, exponent.rat.num)
                : base.kind == ValueKind::ExactRational
                    ? detail::exact_rational_power(base.rat, exponent.rat)
                    : std::nullopt;
            if (exact) return *exact;
        } catch (const RationalOverflow&) {
            // Continue in floating point.
        }
    }
    return detail::approx_power(base, exponent);
}

} // namespace lluna::core
