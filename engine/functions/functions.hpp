#pragma once

#include "../core/number_value.hpp"
#include "../constants/constants.hpp"
#include <cmath>
#include <cstddef>
#include <limits>
#include <numeric>
#include <optional>
#include <stdexcept>
#include <string>

namespace lluna::functions {

using core::NumberValue;
using core::Rational;
using core::ValueKind;

namespace detail {

inline double log10_abs(const NumberValue& value) {
    const auto [mantissa, exponent] = value.to_scientific();
    return std::log10(std::fabs(mantissa)) + static_cast<double>(exponent);
}

inline NumberValue from_log10(double log10_value, double sign = 1.0) {
    if (!std::isfinite(log10_value) || std::fabs(log10_value) > 9.0e18) {
        throw std::runtime_error(core::kUnreasonableComputation);
    }
    const double decade = std::floor(log10_value);
    return NumberValue::from_scientific(sign * std::pow(10.0, log10_value - decade),
                                        static_cast<long long>(decade));
}

// log10(x!) = log10(Gamma(x + 1)) by Stirling's series; accurate to ~1e-15
// relative for the x > 170 range where it is used.
inline double log10_factorial(double x) {
    const double log10_e = 1.0 / constants::kLn10;
    return 0.5 * std::log10(2.0 * constants::kPi * x) + x * (std::log10(x) - log10_e) +
           (1.0 / (12.0 * x) - 1.0 / (360.0 * x * x * x)) * log10_e;
}

inline NumberValue negated(NumberValue value) {
    value.negate();
    return value;
}

// k such that the value equals k*pi/12, when it is an exact multiple.
inline std::optional<long long> twelfths_of_pi(const NumberValue& angle) {
    if (angle.is_zero()) return 0;
    if (angle.kind != ValueKind::ExactConstant || angle.pi_exp != 1 || angle.e_exp != 0) return std::nullopt;
    try {
        const Rational scaled = angle.rat * Rational(12);
        if (!scaled.is_integer()) return std::nullopt;
        long long k = scaled.num % 24;
        return k < 0 ? k + 24 : k;
    } catch (const core::RationalOverflow&) {
        return std::nullopt;
    }
}

// sin(k*pi/12) for k in [0, 6] whenever the value has a closed form here.
inline std::optional<NumberValue> sine_first_quadrant(long long k) {
    switch (k) {
        case 0: return NumberValue(0);
        case 2: return NumberValue(Rational(1, 2));
        case 3: return NumberValue::make_radical(Rational(1, 2), 2);
        case 4: return NumberValue::make_radical(Rational(1, 2), 3);
        case 6: return NumberValue(1);
        default: return std::nullopt;
    }
}

inline std::optional<NumberValue> exact_sine(long long k) {
    k %= 24;
    if (k <= 6) return sine_first_quadrant(k);
    if (k <= 12) return sine_first_quadrant(12 - k);
    auto value = k <= 18 ? sine_first_quadrant(k - 12) : sine_first_quadrant(24 - k);
    if (value) value->negate();
    return value;
}

inline NumberValue approx_trig_result(double value) {
    if (!std::isfinite(value)) throw std::runtime_error("The result is not finite");
    if (std::fabs(value) < 1e-15) return NumberValue(0);
    return NumberValue::make_approx(value);
}

inline double finite_angle(const NumberValue& angle) {
    const double value = angle.to_double();
    if (!std::isfinite(value) || std::fabs(value) > 1e15) {
        throw std::runtime_error("Angle is too large to evaluate accurately");
    }
    return value;
}

// Angle (as a multiple of pi) whose sine is the given exact value, if tabulated.
inline std::optional<Rational> exact_arcsine_ratio(const NumberValue& value) {
    if (value.is_zero()) return Rational(0);
    const bool negative = value.is_negative();
    const Rational magnitude(negative ? -value.rat.num : value.rat.num, value.rat.den);
    std::optional<Rational> ratio;
    if (value.kind == ValueKind::ExactRational) {
        if (magnitude.is_one()) ratio = Rational(1, 2);
        else if (magnitude.num == 1 && magnitude.den == 2) ratio = Rational(1, 6);
    } else if (value.kind == ValueKind::ExactRadical && magnitude.num == 1 && magnitude.den == 2) {
        if (value.radical == 2) ratio = Rational(1, 4);
        else if (value.radical == 3) ratio = Rational(1, 3);
    }
    if (ratio && negative) ratio->num = -ratio->num;
    return ratio;
}

inline std::optional<Rational> exact_arctangent_ratio(const NumberValue& value) {
    if (value.is_zero()) return Rational(0);
    const bool negative = value.is_negative();
    const Rational magnitude(negative ? -value.rat.num : value.rat.num, value.rat.den);
    std::optional<Rational> ratio;
    if (value.kind == ValueKind::ExactRational && magnitude.is_one()) ratio = Rational(1, 4);
    else if (value.kind == ValueKind::ExactRadical && value.radical == 3) {
        if (magnitude.is_one()) ratio = Rational(1, 3);
        else if (magnitude.num == 1 && magnitude.den == 3) ratio = Rational(1, 6);
    }
    if (ratio && negative) ratio->num = -ratio->num;
    return ratio;
}

inline NumberValue pi_multiple(Rational ratio) {
    return NumberValue::make_constant(ratio, 1, 0);
}

} // namespace detail

inline NumberValue eval_power(const NumberValue& base, const NumberValue& exponent) {
    return core::power(base, exponent);
}

inline NumberValue eval_sqrt(const NumberValue& arg) {
    if (arg.is_negative()) throw std::runtime_error("Cannot take the square root of a negative value");
    if (arg.kind == ValueKind::ExactConstant && arg.pi_exp % 2 == 0 && arg.e_exp % 2 == 0) {
        const NumberValue coefficient = NumberValue::make_sqrt(arg.rat);
        if (coefficient.kind == ValueKind::ExactRational) {
            return NumberValue::make_constant(coefficient.rat, arg.pi_exp / 2, arg.e_exp / 2);
        }
    }
    return core::power(arg, NumberValue(Rational(1, 2)));
}

inline NumberValue eval_root(const NumberValue& index, const NumberValue& arg) {
    if (!index.is_integer() || index.is_negative() || index.is_zero()) {
        throw std::runtime_error("Root index must be a positive integer");
    }
    const long long n = index.to_integer();
    if (arg.is_negative() && n % 2 == 0) throw std::runtime_error("Even roots cannot contain a negative value");
    if (n == 2) return eval_sqrt(arg);
    if (n == 1) return arg;
    return core::power(arg, NumberValue(Rational(1, n)));
}

inline NumberValue eval_log(const NumberValue& base, const NumberValue& arg) {
    if (base.is_negative() || base.is_zero()) {
        throw std::runtime_error("Logarithm base must be positive and not equal to 1");
    }
    if (arg.is_negative() || arg.is_zero()) throw std::runtime_error("Logarithm argument must be positive");
    if (base.kind == ValueKind::ExactRational && base.rat.is_one()) {
        throw std::runtime_error("Logarithm base cannot be 1");
    }
    if (arg.kind == ValueKind::ExactRational && arg.rat.is_one()) return NumberValue(0);

    const bool same_exact_value = base.kind == arg.kind && base.kind != ValueKind::RealApprox &&
        base.rat.num == arg.rat.num && base.rat.den == arg.rat.den && base.radical == arg.radical &&
        base.pi_exp == arg.pi_exp && base.e_exp == arg.e_exp;
    if (same_exact_value) return NumberValue(1);

    // log_b(a) = ±k when a or 1/a is an integer power of b or 1/b.
    if (base.kind == ValueKind::ExactRational && arg.kind == ValueKind::ExactRational) {
        const Rational& b = base.rat;
        const Rational& a = arg.rat;
        const auto match = [](long long base_part, long long arg_part, long long sign) -> std::optional<NumberValue> {
            const auto [is_power, k] = core::check_integer_log(base_part, arg_part);
            if (is_power) return NumberValue(sign * k);
            return std::nullopt;
        };
        std::optional<NumberValue> exact;
        if (b.den == 1 && a.den == 1) exact = match(b.num, a.num, 1);
        else if (b.den == 1 && a.num == 1) exact = match(b.num, a.den, -1);
        else if (b.num == 1 && a.den == 1) exact = match(b.den, a.num, -1);
        else if (b.num == 1 && a.num == 1) exact = match(b.den, a.den, 1);
        if (exact) return *exact;
    }

    const double denominator = detail::log10_abs(base);
    if (denominator == 0.0) throw std::runtime_error("Logarithm base cannot be 1");
    return NumberValue::make_approx(detail::log10_abs(arg) / denominator);
}

inline NumberValue eval_ln(const NumberValue& arg) {
    if (arg.is_negative() || arg.is_zero()) throw std::runtime_error("Logarithm argument must be positive");
    if (arg.kind == ValueKind::ExactRational && arg.rat.is_one()) return NumberValue(0);
    if (arg.kind == ValueKind::ExactConstant && arg.pi_exp == 0 && arg.rat.is_one()) return NumberValue(arg.e_exp);
    return NumberValue::make_approx(detail::log10_abs(arg) * constants::kLn10);
}

inline NumberValue eval_exp(const NumberValue& arg) {
    return core::power(NumberValue::make_e(), arg);
}

inline NumberValue eval_factorial(const NumberValue& arg) {
    if (arg.is_negative() && arg.is_integer()) throw std::runtime_error("Factorial is undefined for negative integers");
    if (arg.exponent() >= 18 && std::fabs(arg.to_double()) > 1e18) {
        throw std::runtime_error(core::kUnreasonableComputation);
    }

    if (arg.is_integer()) {
        const long long n = arg.to_integer();
        if (n <= 20) {
            long long product = 1;
            for (long long i = 2; i <= n; ++i) product *= i;
            return NumberValue(product);
        }
        if (n <= 170) {
            double product = 1.0;
            for (long long i = 2; i <= n; ++i) product *= static_cast<double>(i);
            return NumberValue::make_approx(product);
        }
        if (n <= 100000) {
            double mantissa = 1.0;
            long long exponent = 0;
            for (long long i = 2; i <= n; ++i) {
                mantissa *= static_cast<double>(i);
                if (mantissa >= 1e12) {
                    mantissa /= 1e12;
                    exponent += 12;
                }
            }
            return NumberValue::from_scientific(mantissa, exponent);
        }
        return detail::from_log10(detail::log10_factorial(static_cast<double>(n)));
    }

    // Non-integers use Gamma: x! = Gamma(x + 1).
    const double x = arg.to_double();
    if (std::fabs(x) <= 170.0) {
        const double value = std::tgamma(x + 1.0);
        if (!std::isfinite(value)) throw std::runtime_error("The result is not finite");
        return NumberValue::make_approx(value);
    }
    if (x > 0.0) return detail::from_log10(detail::log10_factorial(x));

    // Reflection: Gamma(x + 1) = pi / (sin(pi (x + 1)) * Gamma(-x)), with Gamma(-x) = (-x - 1)!.
    const double sine = std::sin(constants::kPi * (x + 1.0));
    if (sine == 0.0) throw std::runtime_error("Factorial is undefined for negative integers");
    const double log10_value = std::log10(constants::kPi) - std::log10(std::fabs(sine)) -
                               detail::log10_factorial(-x - 1.0);
    return detail::from_log10(log10_value, sine < 0.0 ? -1.0 : 1.0);
}

inline NumberValue eval_abs(const NumberValue& arg) {
    return arg.is_negative() ? detail::negated(arg) : arg;
}

inline NumberValue eval_sin(const NumberValue& arg) {
    if (const auto k = detail::twelfths_of_pi(arg)) {
        if (auto exact = detail::exact_sine(*k)) return *exact;
    }
    return detail::approx_trig_result(std::sin(detail::finite_angle(arg)));
}

inline NumberValue eval_cos(const NumberValue& arg) {
    if (const auto k = detail::twelfths_of_pi(arg)) {
        if (auto exact = detail::exact_sine(*k + 6)) return *exact;
    }
    return detail::approx_trig_result(std::cos(detail::finite_angle(arg)));
}

inline NumberValue eval_tan(const NumberValue& arg) {
    if (const auto k = detail::twelfths_of_pi(arg)) {
        if (*k % 12 == 6) throw std::runtime_error("Tangent is undefined at odd multiples of pi/2");
        const auto sine = detail::exact_sine(*k);
        const auto cosine = detail::exact_sine(*k + 6);
        if (sine && cosine) return core::divide(*sine, *cosine);
    }
    const double angle = detail::finite_angle(arg);
    const double cosine = std::cos(angle);
    if (std::fabs(cosine) < 1e-14) throw std::runtime_error("Tangent is undefined at this angle");
    return detail::approx_trig_result(std::sin(angle) / cosine);
}

inline NumberValue eval_asin(const NumberValue& arg) {
    const double value = arg.to_double();
    if (!(std::fabs(value) <= 1.0)) throw std::runtime_error("Inverse sine is only defined on [-1, 1]");
    if (const auto ratio = detail::exact_arcsine_ratio(arg)) return detail::pi_multiple(*ratio);
    return NumberValue::make_approx(std::asin(value));
}

inline NumberValue eval_acos(const NumberValue& arg) {
    const double value = arg.to_double();
    if (!(std::fabs(value) <= 1.0)) throw std::runtime_error("Inverse cosine is only defined on [-1, 1]");
    if (const auto ratio = detail::exact_arcsine_ratio(arg)) {
        return detail::pi_multiple(Rational(1, 2) - *ratio);
    }
    return NumberValue::make_approx(std::acos(value));
}

inline NumberValue eval_atan(const NumberValue& arg) {
    if (const auto ratio = detail::exact_arctangent_ratio(arg)) return detail::pi_multiple(*ratio);
    return NumberValue::make_approx(std::atan(arg.to_double()));
}

inline NumberValue eval_gcd(const NumberValue& a, const NumberValue& b) {
    if (!a.is_integer() || !b.is_integer()) throw std::runtime_error("gcd requires integer arguments");
    return NumberValue(std::gcd(std::llabs(a.to_integer()), std::llabs(b.to_integer())));
}

inline NumberValue eval_lcm(const NumberValue& a, const NumberValue& b) {
    if (!a.is_integer() || !b.is_integer()) throw std::runtime_error("lcm requires integer arguments");
    const long long left = std::llabs(a.to_integer());
    const long long right = std::llabs(b.to_integer());
    if (left == 0 || right == 0) return NumberValue(0);
    const long long reduced = left / std::gcd(left, right);
    try {
        return NumberValue(core::checked_multiply(reduced, right));
    } catch (const core::RationalOverflow&) {
        return NumberValue::make_approx(static_cast<double>(reduced) * static_cast<double>(right));
    }
}

inline NumberValue eval_mod(const NumberValue& a, const NumberValue& b) {
    if (b.is_zero()) throw std::runtime_error("Cannot divide by zero");
    if (a.kind == ValueKind::ExactRational && b.kind == ValueKind::ExactRational) {
        // a - b*floor(a/b), exact for rationals.
        const Rational quotient = a.rat / b.rat;
        long long floor_value = quotient.num / quotient.den;
        if (quotient.num % quotient.den != 0 && quotient.num < 0) --floor_value;
        const Rational remainder = a.rat - b.rat * Rational(floor_value);
        return NumberValue(remainder);
    }
    const double divisor = b.to_double();
    double remainder = std::fmod(a.to_double(), divisor);
    if (remainder != 0.0 && (remainder < 0.0) != (divisor < 0.0)) remainder += divisor;
    return NumberValue::make_approx(remainder);
}

inline NumberValue eval_nCr(const NumberValue& a, const NumberValue& b) {
    if (!a.is_integer() || !b.is_integer()) throw std::runtime_error("Combinations (nCr) require integer arguments");
    const long long n = a.to_integer();
    long long r = b.to_integer();
    if (r < 0 || r > n) return NumberValue(0);
    if (r > n - r) r = n - r;
    try {
        // Each partial product is C(n - r + i, i), so the division is exact;
        // dividing by gcd first keeps intermediates as small as possible.
        long long result = 1;
        for (long long i = 1; i <= r; ++i) {
            const long long g = std::gcd(result, i);
            result = core::checked_multiply(result / g, (n - r + i) / (i / g));
        }
        return NumberValue(result);
    } catch (const core::RationalOverflow&) {
        return core::divide(eval_factorial(a),
                            core::multiply(eval_factorial(NumberValue(r)), eval_factorial(NumberValue(n - r))));
    }
}

inline NumberValue eval_nPr(const NumberValue& a, const NumberValue& b) {
    if (!a.is_integer() || !b.is_integer()) throw std::runtime_error("Permutations (nPr) require integer arguments");
    const long long n = a.to_integer();
    const long long r = b.to_integer();
    if (r < 0 || r > n) return NumberValue(0);
    try {
        long long result = 1;
        for (long long i = 0; i < r; ++i) result = core::checked_multiply(result, n - i);
        return NumberValue(result);
    } catch (const core::RationalOverflow&) {
        return core::divide(eval_factorial(a), eval_factorial(NumberValue(n - r)));
    }
}

struct FunctionSpec {
    const char* name;
    unsigned min_args;
    unsigned max_args;
    NumberValue (*unary)(const NumberValue&);
    NumberValue (*binary)(const NumberValue&, const NumberValue&);
};

inline NumberValue log10_of(const NumberValue& arg) { return eval_log(NumberValue(10), arg); }

// Single source of truth for callable functions: the parser uses it to
// recognise names and the evaluator to dispatch and check arity.
inline constexpr FunctionSpec kFunctions[] = {
    {"sqrt", 1, 1, eval_sqrt, nullptr},
    {"root", 2, 2, nullptr, eval_root},
    {"log", 1, 2, log10_of, eval_log},
    {"ln", 1, 1, eval_ln, nullptr},
    {"exp", 1, 1, eval_exp, nullptr},
    {"abs", 1, 1, eval_abs, nullptr},
    {"sin", 1, 1, eval_sin, nullptr},
    {"cos", 1, 1, eval_cos, nullptr},
    {"tan", 1, 1, eval_tan, nullptr},
    {"asin", 1, 1, eval_asin, nullptr},
    {"acos", 1, 1, eval_acos, nullptr},
    {"atan", 1, 1, eval_atan, nullptr},
    {"gcd", 2, 2, nullptr, eval_gcd},
    {"lcm", 2, 2, nullptr, eval_lcm},
    {"mod", 2, 2, nullptr, eval_mod},
    {"nCr", 2, 2, nullptr, eval_nCr},
    {"comb", 2, 2, nullptr, eval_nCr},
    {"nPr", 2, 2, nullptr, eval_nPr},
    {"perm", 2, 2, nullptr, eval_nPr},
};

inline const FunctionSpec* find_function(const std::string& name) {
    for (const auto& spec : kFunctions) {
        if (name == spec.name) return &spec;
    }
    return nullptr;
}

inline bool is_function_name(const std::string& name) {
    return find_function(name) != nullptr;
}

inline std::string arity_message(const FunctionSpec& spec) {
    std::string message = std::string(spec.name) + " requires ";
    if (spec.min_args == spec.max_args) {
        message += "exactly " + std::to_string(spec.min_args) + (spec.min_args == 1 ? " argument" : " arguments");
    } else {
        message += std::to_string(spec.min_args) + " or " + std::to_string(spec.max_args) + " arguments";
    }
    return message;
}

} // namespace lluna::functions
