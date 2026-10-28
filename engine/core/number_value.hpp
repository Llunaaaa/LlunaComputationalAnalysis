#pragma once

#include <cmath>
#include <string>
#include <numeric>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <stdexcept>
#include <limits>
#include <utility>

namespace lluna::core {

struct Rational {
    long long num = 0;
    long long den = 1;

    Rational() : num(0), den(1) {}
    Rational(long long n) : num(n), den(1) {}
    Rational(long long n, long long d) : num(n), den(d) {
        normalize();
    }

    void normalize() {
        if (den == 0) throw std::runtime_error("Cannot divide by zero");
        if (den < 0) { num = -num; den = -den; }
        if (num == 0) { den = 1; return; }
        long long g = std::gcd(std::abs(num), den);
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
    long long g = std::gcd(a.den, b.den);
    long long l_den = a.den / g;
    long long r_den = b.den / g;
    long long num = a.num * r_den + b.num * l_den;
    long long den = l_den * b.den;
    return Rational(num, den);
}
inline Rational operator-(Rational a, Rational b) {
    return a + Rational(-b.num, b.den);
}
inline Rational operator*(Rational a, Rational b) {
    long long g1 = std::gcd(std::abs(a.num), b.den);
    long long g2 = std::gcd(std::abs(b.num), a.den);
    long long a_num = a.num / g1;
    long long b_den = b.den / g1;
    long long b_num = b.num / g2;
    long long a_den = a.den / g2;
    return Rational(a_num * b_num, a_den * b_den);
}
inline Rational operator/(Rational a, Rational b) {
    if (b.num == 0) throw std::runtime_error("Cannot divide by zero");
    return a * Rational(b.den, b.num);
}

inline std::pair<long long, long long> simplify_sqrt(long long n) {
    if (n <= 0) return {0, 0};
    long long s = 1;
    long long r = n;
    for (long long factor = 2; factor * factor <= r; ++factor) {
        while (r % (factor * factor) == 0) {
            s *= factor;
            r /= (factor * factor);
        }
    }
    return {s, r}; // n = s^2 * r
}

inline std::pair<bool, long long> check_integer_log(long long base, long long val) {
    if (base <= 1 || val <= 0) return {false, 0};
    if (val == 1) return {true, 0};
    long long p = 0;
    long long cur = 1;
    while (cur < val && p < 60) {
        if (val % base != 0) return {false, 0};
        cur *= base;
        p++;
    }
    if (cur == val) return {true, p};
    return {false, 0};
}

enum class ValueKind {
    ExactRational,
    ExactRadical,    // q * sqrt(r) where r is square-free integer > 1
    ExactConstant,   // q * pi^k * e^m
    RealApprox       // non-exact floating point / scientific number
};

class NumberValue {
public:
    ValueKind kind = ValueKind::ExactRational;
    Rational rat;           // used in ExactRational, ExactRadical, ExactConstant
    long long radical = 1;  // square-free integer inside sqrt
    int pi_exp = 0;         // exponent of pi
    int e_exp = 0;          // exponent of e
    double real_val = 0.0;
    long long sci_exp = 0;  // for huge scientific numbers
    std::string exact_repr = "";

    NumberValue() : kind(ValueKind::ExactRational), rat(0) {}
    NumberValue(int n) : kind(ValueKind::ExactRational), rat(static_cast<long long>(n)) {}
    NumberValue(long long n) : kind(ValueKind::ExactRational), rat(n) {}
    NumberValue(Rational r) : kind(ValueKind::ExactRational), rat(r) {
        if (!rat.is_integer()) {
            exact_repr = std::to_string(rat.num) + "/" + std::to_string(rat.den);
        }
    }

    static NumberValue from_literal(const std::string& text, double fallback_val) {
        if (text.find('e') != std::string::npos || text.find('E') != std::string::npos) {
            return NumberValue(fallback_val);
        }
        size_t dot_pos = text.find('.');
        if (dot_pos == std::string::npos) {
            try {
                long long val = std::stoll(text);
                return NumberValue(val);
            } catch (...) {
                return NumberValue(fallback_val);
            }
        }
        std::string int_part = text.substr(0, dot_pos);
        std::string frac_part = text.substr(dot_pos + 1);
        if (frac_part.size() <= 15 && text.size() <= 18) {
            try {
                int k = static_cast<int>(frac_part.size());
                long long den = 1;
                for (int i = 0; i < k; ++i) den *= 10;
                long long whole = int_part.empty() ? 0 : std::stoll(int_part);
                long long frac = frac_part.empty() ? 0 : std::stoll(frac_part);
                long long num = (whole >= 0) ? (whole * den + frac) : (whole * den - frac);
                return NumberValue(Rational(num, den));
            } catch (...) {
                return NumberValue(fallback_val);
            }
        }
        return NumberValue(fallback_val);
    }

    NumberValue(double val, bool approx = false, const std::string& exact = "") {
        if (!std::isfinite(val)) throw std::runtime_error("The result is not finite");
        exact_repr = exact;
        if (approx) {
            kind = ValueKind::RealApprox;
            real_val = val;
        } else {
            // Check if val is an exact integer
            if (val == std::floor(val) && std::fabs(val) < 9e15) {
                kind = ValueKind::ExactRational;
                rat = Rational(static_cast<long long>(val));
            } else {
                kind = ValueKind::RealApprox;
                real_val = val;
            }
        }
    }

    static NumberValue make_pi() {
        NumberValue v;
        v.kind = ValueKind::ExactConstant;
        v.rat = Rational(1);
        v.pi_exp = 1;
        v.exact_repr = "π";
        return v;
    }

    static NumberValue make_e() {
        NumberValue v;
        v.kind = ValueKind::ExactConstant;
        v.rat = Rational(1);
        v.e_exp = 1;
        v.exact_repr = "e";
        return v;
    }

    static NumberValue make_sqrt(Rational arg) {
        if (arg.num < 0) throw std::runtime_error("Cannot take square root of a negative value");
        if (arg.num == 0) return NumberValue(0);
        long long prod = arg.num * arg.den;
        auto [s, r] = simplify_sqrt(prod);
        Rational coeff = Rational(s, arg.den);
        if (r == 1) {
            // Perfect square!
            return NumberValue(coeff);
        }
        NumberValue v;
        v.kind = ValueKind::ExactRadical;
        v.rat = coeff;
        v.radical = r;
        v.exact_repr = (coeff.is_one() ? "" : (coeff.is_integer() ? std::to_string(coeff.num) : std::to_string(coeff.num) + "/" + std::to_string(coeff.den))) + "sqrt(" + std::to_string(r) + ")";
        return v;
    }

    static NumberValue make_approx(double val) {
        NumberValue v;
        v.kind = ValueKind::RealApprox;
        v.real_val = val;
        return v;
    }

    static NumberValue from_scientific(double man, long long exp, [[maybe_unused]] bool approx = false, const std::string& exact = "") {
        NumberValue v;
        v.kind = ValueKind::RealApprox;
        v.real_val = man;
        v.sci_exp = exp;
        v.exact_repr = exact;
        v.normalize_scientific();
        return v;
    }

    void normalize_scientific() {
        if (real_val == 0.0) {
            sci_exp = 0;
            return;
        }
        double sign = real_val < 0.0 ? -1.0 : 1.0;
        double abs_man = std::fabs(real_val);
        while (abs_man >= 10.0) {
            abs_man /= 10.0;
            sci_exp++;
        }
        while (abs_man < 1.0 && abs_man > 0.0) {
            abs_man *= 10.0;
            sci_exp--;
        }
        real_val = sign * abs_man;
    }

    bool is_exact() const {
        return kind == ValueKind::ExactRational;
    }

    bool is_approximate() const {
        return !is_exact();
    }

    bool is_large() const {
        return kind == ValueKind::RealApprox && (sci_exp > 300 || sci_exp < -300);
    }

    bool is_negative() const {
        switch (kind) {
            case ValueKind::ExactRational: return rat.is_negative();
            case ValueKind::ExactRadical: return rat.is_negative();
            case ValueKind::ExactConstant: return rat.is_negative();
            case ValueKind::RealApprox: return real_val < 0.0;
        }
        return false;
    }

    bool is_zero() const {
        switch (kind) {
            case ValueKind::ExactRational: return rat.is_zero();
            case ValueKind::ExactRadical: return rat.is_zero();
            case ValueKind::ExactConstant: return rat.is_zero();
            case ValueKind::RealApprox: return real_val == 0.0;
        }
        return false;
    }

    bool is_integer() const {
        if (kind == ValueKind::ExactRational) return rat.is_integer();
        if (kind == ValueKind::RealApprox && sci_exp > 0) return true;
        double d = to_double();
        if (!std::isfinite(d)) return false;
        if (d == std::floor(d)) return true;
        return std::fabs(d - std::round(d)) < 1e-11;
    }

    long long to_integer() const {
        if (!is_integer()) throw std::runtime_error("Value is not an integer");
        if (kind == ValueKind::ExactRational) return rat.num;
        return static_cast<long long>(std::round(to_double()));
    }

    void negate() {
        switch (kind) {
            case ValueKind::ExactRational: rat.num = -rat.num; break;
            case ValueKind::ExactRadical: rat.num = -rat.num; break;
            case ValueKind::ExactConstant: rat.num = -rat.num; break;
            case ValueKind::RealApprox: real_val = -real_val; break;
        }
    }

    double to_double() const {
        double pi_val = 4.0 * std::atan(1.0);
        double e_val = std::exp(1.0);
        switch (kind) {
            case ValueKind::ExactRational:
                return rat.to_double();
            case ValueKind::ExactRadical:
                return rat.to_double() * std::sqrt(static_cast<double>(radical));
            case ValueKind::ExactConstant:
                return rat.to_double() * std::pow(pi_val, pi_exp) * std::pow(e_val, e_exp);
            case ValueKind::RealApprox:
                if (sci_exp != 0) return real_val * std::pow(10.0, sci_exp);
                return real_val;
        }
        return 0.0;
    }

    std::pair<double, long long> to_scientific() const {
        if (kind == ValueKind::RealApprox && sci_exp != 0) {
            return {real_val, sci_exp};
        }
        double d = to_double();
        if (d == 0.0) return {0.0, 0};
        double sign = d < 0.0 ? -1.0 : 1.0;
        double abs_val = std::fabs(d);
        long long exp = static_cast<long long>(std::floor(std::log10(abs_val)));
        double man = abs_val / std::pow(10.0, exp);
        while (man >= 10.0) { man /= 10.0; exp++; }
        while (man < 1.0 && man > 0.0) { man *= 10.0; exp--; }
        return {sign * man, exp};
    }

    double mantissa() const {
        return to_scientific().first;
    }

    long long exponent() const {
        return to_scientific().second;
    }

    std::string format() const {
        if (kind == ValueKind::ExactRational) {
            if (rat.is_integer()) {
                if (std::abs(rat.num) <= 10000000000000000LL) { // <= 1e16
                    return std::to_string(rat.num);
                }
                char buf[64];
                std::snprintf(buf, sizeof(buf), "%.15g", rat.to_double());
                return buf;
            }
            double d = rat.to_double();
            char buf[64];
            std::snprintf(buf, sizeof(buf), "%.15g", d);
            return buf;
        }

        auto [man, exp] = to_scientific();
        if (man == 0.0) return "0";

        // Scientific notation only appears if exponent > 16 or < -6
        if (exp > 16 || exp < -6) {
            char buf[64];
            std::snprintf(buf, sizeof(buf), "%.15ge%+lld", man, exp);
            return buf;
        }

        double val = to_double();
        if (val == std::floor(val) && std::fabs(val) < 1e16) {
            return std::to_string(static_cast<long long>(val));
        }

        char buf[64];
        std::snprintf(buf, sizeof(buf), "%.15g", val);
        std::string s(buf);
        if (s.find('e') != std::string::npos || s.find('E') != std::string::npos) {
            std::snprintf(buf, sizeof(buf), "%.*f", static_cast<int>(std::max(0LL, 15 - exp)), val);
            s = buf;
            while (s.find('.') != std::string::npos && (s.back() == '0' || s.back() == '.')) {
                bool was_dot = (s.back() == '.');
                s.pop_back();
                if (was_dot) break;
            }
        }
        return s;
    }
};

inline NumberValue add(const NumberValue& a, const NumberValue& b) {
    if (a.kind == ValueKind::ExactRational && b.kind == ValueKind::ExactRational) {
        return NumberValue(a.rat + b.rat);
    }
    if (a.kind == ValueKind::ExactConstant && b.kind == ValueKind::ExactConstant) {
        if (a.pi_exp == b.pi_exp && a.e_exp == b.e_exp) {
            Rational r = a.rat + b.rat;
            if (r.is_zero()) return NumberValue(0);
            NumberValue res = a;
            res.rat = r;
            return res;
        }
    }
    if (a.kind == ValueKind::ExactRadical && b.kind == ValueKind::ExactRadical) {
        if (a.radical == b.radical) {
            Rational r = a.rat + b.rat;
            if (r.is_zero()) return NumberValue(0);
            NumberValue res = a;
            res.rat = r;
            return res;
        }
    }
    if (a.kind == ValueKind::ExactRational && a.rat.is_zero()) return b;
    if (b.kind == ValueKind::ExactRational && b.rat.is_zero()) return a;

    if (a.is_large() || b.is_large()) {
        auto [m1, e1] = a.to_scientific();
        auto [m2, e2] = b.to_scientific();
        long long exp_diff = e1 - e2;
        if (exp_diff > 16) return a;
        if (exp_diff < -16) return b;
        double m2_scaled = m2 * std::pow(10.0, -exp_diff);
        return NumberValue::from_scientific(m1 + m2_scaled, e1, true);
    }

    return NumberValue::make_approx(a.to_double() + b.to_double());
}

inline NumberValue subtract(const NumberValue& a, const NumberValue& b) {
    if (a.kind == ValueKind::ExactRational && b.kind == ValueKind::ExactRational) {
        return NumberValue(a.rat - b.rat);
    }
    if (a.kind == ValueKind::ExactConstant && b.kind == ValueKind::ExactConstant) {
        if (a.pi_exp == b.pi_exp && a.e_exp == b.e_exp) {
            Rational r = a.rat - b.rat;
            if (r.is_zero()) return NumberValue(0);
            NumberValue res = a;
            res.rat = r;
            return res;
        }
    }
    if (a.kind == ValueKind::ExactRadical && b.kind == ValueKind::ExactRadical) {
        if (a.radical == b.radical) {
            Rational r = a.rat - b.rat;
            if (r.is_zero()) return NumberValue(0);
            NumberValue res = a;
            res.rat = r;
            return res;
        }
    }
    if (b.kind == ValueKind::ExactRational && b.rat.is_zero()) return a;

    NumberValue neg_b = b;
    neg_b.negate();
    return add(a, neg_b);
}

inline NumberValue multiply(const NumberValue& a, const NumberValue& b) {
    if (a.is_zero() || b.is_zero()) return NumberValue(0);

    // Rational * Rational
    if (a.kind == ValueKind::ExactRational && b.kind == ValueKind::ExactRational) {
        return NumberValue(a.rat * b.rat);
    }

    // Rational * Constant
    if (a.kind == ValueKind::ExactRational && b.kind == ValueKind::ExactConstant) {
        NumberValue res = b;
        res.rat = a.rat * b.rat;
        return res;
    }
    if (a.kind == ValueKind::ExactConstant && b.kind == ValueKind::ExactRational) {
        NumberValue res = a;
        res.rat = a.rat * b.rat;
        return res;
    }

    // Constant * Constant
    if (a.kind == ValueKind::ExactConstant && b.kind == ValueKind::ExactConstant) {
        NumberValue res;
        res.kind = ValueKind::ExactConstant;
        res.rat = a.rat * b.rat;
        res.pi_exp = a.pi_exp + b.pi_exp;
        res.e_exp = a.e_exp + b.e_exp;
        if (res.pi_exp == 0 && res.e_exp == 0) {
            res.kind = ValueKind::ExactRational;
        }
        return res;
    }

    // Rational * Radical
    if (a.kind == ValueKind::ExactRational && b.kind == ValueKind::ExactRadical) {
        NumberValue res = b;
        res.rat = a.rat * b.rat;
        return res;
    }
    if (a.kind == ValueKind::ExactRadical && b.kind == ValueKind::ExactRational) {
        NumberValue res = a;
        res.rat = a.rat * b.rat;
        return res;
    }

    // Radical * Radical
    if (a.kind == ValueKind::ExactRadical && b.kind == ValueKind::ExactRadical) {
        long long prod = a.radical * b.radical;
        auto [s, r] = simplify_sqrt(prod);
        Rational coeff = a.rat * b.rat * Rational(s);
        if (r == 1) {
            return NumberValue(coeff);
        }
        NumberValue res;
        res.kind = ValueKind::ExactRadical;
        res.rat = coeff;
        res.radical = r;
        return res;
    }

    // Scientific / Large
    if (a.is_large() || b.is_large()) {
        auto [m1, e1] = a.to_scientific();
        auto [m2, e2] = b.to_scientific();
        if ((e2 > 0 && e1 > std::numeric_limits<long long>::max() - e2) ||
            (e2 < 0 && e1 < std::numeric_limits<long long>::min() - e2)) {
            throw std::runtime_error("Operation requires an unreasonable amount of computational power");
        }
        return NumberValue::from_scientific(m1 * m2, e1 + e2, true);
    }

    return NumberValue::make_approx(a.to_double() * b.to_double());
}

inline NumberValue divide(const NumberValue& a, const NumberValue& b) {
    if (b.is_zero()) {
        throw std::runtime_error("Cannot divide by zero");
    }

    // Rational / Rational
    if (a.kind == ValueKind::ExactRational && b.kind == ValueKind::ExactRational) {
        return NumberValue(a.rat / b.rat);
    }

    // Constant / Constant (e.g. pi / pi -> 1!)
    if (a.kind == ValueKind::ExactConstant && b.kind == ValueKind::ExactConstant) {
        NumberValue res;
        res.kind = ValueKind::ExactConstant;
        res.rat = a.rat / b.rat;
        res.pi_exp = a.pi_exp - b.pi_exp;
        res.e_exp = a.e_exp - b.e_exp;
        if (res.pi_exp == 0 && res.e_exp == 0) {
            // Cancelled completely!
            res.kind = ValueKind::ExactRational;
        }
        return res;
    }

    // Radical / Radical (e.g. sqrt(2) / sqrt(2) -> 1!)
    if (a.kind == ValueKind::ExactRadical && b.kind == ValueKind::ExactRadical) {
        if (a.radical == b.radical) {
            return NumberValue(a.rat / b.rat);
        }
        long long prod = a.radical * b.radical;
        auto [s, r] = simplify_sqrt(prod);
        Rational coeff = (a.rat / b.rat) * Rational(s, b.radical);
        if (r == 1) return NumberValue(coeff);
        NumberValue res;
        res.kind = ValueKind::ExactRadical;
        res.rat = coeff;
        res.radical = r;
        return res;
    }

    // Constant / Rational
    if (a.kind == ValueKind::ExactConstant && b.kind == ValueKind::ExactRational) {
        NumberValue res = a;
        res.rat = a.rat / b.rat;
        return res;
    }

    // Rational / Constant (e.g. 1 / pi -> pi^-1, 2 / pi -> 2*pi^-1)
    if (a.kind == ValueKind::ExactRational && b.kind == ValueKind::ExactConstant) {
        NumberValue res;
        res.kind = ValueKind::ExactConstant;
        res.rat = a.rat / b.rat;
        res.pi_exp = -b.pi_exp;
        res.e_exp = -b.e_exp;
        return res;
    }

    // Radical / Rational
    if (a.kind == ValueKind::ExactRadical && b.kind == ValueKind::ExactRational) {
        NumberValue res = a;
        res.rat = a.rat / b.rat;
        return res;
    }

    // Rational / Radical (e.g. 1 / sqrt(2) -> (1/2)*sqrt(2), 2 / sqrt(2) -> sqrt(2))
    if (a.kind == ValueKind::ExactRational && b.kind == ValueKind::ExactRadical) {
        Rational coeff = (a.rat / b.rat) / Rational(b.radical);
        NumberValue res;
        res.kind = ValueKind::ExactRadical;
        res.rat = coeff;
        res.radical = b.radical;
        return res;
    }

    // Large scientific
    if (a.is_large() || b.is_large()) {
        auto [m1, e1] = a.to_scientific();
        auto [m2, e2] = b.to_scientific();
        if ((e2 < 0 && e1 > std::numeric_limits<long long>::max() + e2) ||
            (e2 > 0 && e1 < std::numeric_limits<long long>::min() + e2)) {
            throw std::runtime_error("Operation requires an unreasonable amount of computational power");
        }
        return NumberValue::from_scientific(m1 / m2, e1 - e2, true);
    }

    return NumberValue::make_approx(a.to_double() / b.to_double());
}

inline NumberValue power(const NumberValue& a, const NumberValue& b) {
    if (b.is_zero()) return NumberValue(1);
    if (a.is_zero()) {
        if (b.is_negative()) throw std::runtime_error("Cannot divide by zero");
        return NumberValue(0);
    }

    // Guardrail against massive exponentiation
    if (b.is_large() && (b.sci_exp > 18 || b.sci_exp < -18)) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }

    // Rational ^ Integer
    if (a.kind == ValueKind::ExactRational && b.kind == ValueKind::ExactRational && b.rat.is_integer()) {
        long long p = b.rat.num;
        if (std::abs(p) <= 25) {
            long long num_p = 1;
            long long den_p = 1;
            long long abs_p = std::abs(p);
            for (long long i = 0; i < abs_p; ++i) {
                num_p *= a.rat.num;
                den_p *= a.rat.den;
            }
            if (p >= 0) return NumberValue(Rational(num_p, den_p));
            else return NumberValue(Rational(den_p, num_p));
        }
    }

    // Radical ^ Integer (e.g. (sqrt(2))^2 = 2, (sqrt(2))^4 = 4, (sqrt(2))^3 = 2*sqrt(2))
    if (a.kind == ValueKind::ExactRadical && b.kind == ValueKind::ExactRational && b.rat.is_integer()) {
        long long p = b.rat.num;
        if (std::abs(p) <= 25) {
            if (p == 0) return NumberValue(1);
            long long abs_p = std::abs(p);

            Rational q_pow(1);
            for (long long i = 0; i < abs_p; ++i) {
                q_pow = q_pow * a.rat;
            }

            long long k = abs_p / 2;
            Rational r_pow(1);
            for (long long i = 0; i < k; ++i) {
                r_pow = r_pow * Rational(a.radical);
            }

            if (abs_p % 2 == 0) {
                Rational total = q_pow * r_pow;
                if (p < 0) total = Rational(1) / total;
                return NumberValue(total);
            } else {
                Rational coeff = q_pow * r_pow;
                if (p < 0) {
                    coeff = Rational(1) / (coeff * Rational(a.radical));
                }
                NumberValue res;
                res.kind = ValueKind::ExactRadical;
                res.rat = coeff;
                res.radical = a.radical;
                return res;
            }
        }
    }

    // Constant ^ Integer
    if (a.kind == ValueKind::ExactConstant && b.kind == ValueKind::ExactRational && b.rat.is_integer()) {
        long long p = b.rat.num;
        if (std::abs(p) <= 25) {
            NumberValue res = a;
            res.pi_exp *= p;
            res.e_exp *= p;
            long long num_p = 1, den_p = 1;
            long long abs_p = std::abs(p);
            for (long long i = 0; i < abs_p; ++i) {
                num_p *= a.rat.num;
                den_p *= a.rat.den;
            }
            res.rat = (p >= 0) ? Rational(num_p, den_p) : Rational(den_p, num_p);
            return res;
        }
    }

    // Large floating power
    auto [m1, e1] = a.to_scientific();
    if (m1 < 0.0 && !b.is_integer()) {
        throw std::runtime_error("Negative base with non-integer exponent");
    }
    double log10_a = std::log10(std::fabs(m1)) + static_cast<double>(e1);
    double b_val = b.to_double();
    double total_log = b_val * log10_a;

    if (!std::isfinite(total_log) ||
        total_log > static_cast<double>(std::numeric_limits<long long>::max()) - 1000.0 ||
        total_log < static_cast<double>(std::numeric_limits<long long>::min()) + 1000.0) {
        throw std::runtime_error("Operation requires an unreasonable amount of computational power");
    }

    long long new_e = static_cast<long long>(std::floor(total_log));
    double rem = total_log - static_cast<double>(new_e);
    double sign = (m1 < 0.0 && (b.to_integer() % 2 != 0)) ? -1.0 : 1.0;
    double new_m = sign * std::pow(10.0, rem);
    return NumberValue::from_scientific(new_m, new_e, true);
}

} // namespace lluna::core
