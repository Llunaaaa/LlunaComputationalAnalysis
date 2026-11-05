#pragma once

#include "number_value.hpp"
#include "../constants/constants.hpp"
#include "../functions/functions.hpp"
#include <array>
#include <cmath>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace lluna::core {

// Immutable linked scope. Binding a variable creates a child frame on the
// stack, so numerical methods can sample thousands of points without copying.
struct EvaluationContext {
    const std::string* name = nullptr;
    NumberValue value;
    const EvaluationContext* parent = nullptr;

    const NumberValue* get_variable(const std::string& variable) const {
        for (const EvaluationContext* scope = this; scope; scope = scope->parent) {
            if (scope->name && *scope->name == variable) return &scope->value;
        }
        return nullptr;
    }

    EvaluationContext bind(const std::string& variable, NumberValue bound) const {
        return EvaluationContext{&variable, std::move(bound), this};
    }
};

class AstNode {
public:
    virtual ~AstNode() = default;
    virtual NumberValue evaluate(const EvaluationContext& ctx) const = 0;
    NumberValue evaluate() const { return evaluate(EvaluationContext{}); }
};

using NodePtr = std::unique_ptr<AstNode>;

class NumberNode : public AstNode {
public:
    NumberNode(const std::string& text, double value) : value_(NumberValue::from_literal(text, value)) {}
    NumberValue evaluate(const EvaluationContext&) const override { return value_; }

private:
    NumberValue value_;
};

class ConstantNode : public AstNode {
public:
    explicit ConstantNode(const constants::ConstantDefinition& definition) : definition_(definition) {}

    NumberValue evaluate(const EvaluationContext&) const override {
        switch (definition_.id) {
            case constants::ConstantId::Pi: return NumberValue::make_pi();
            case constants::ConstantId::E: return NumberValue::make_e();
            case constants::ConstantId::Phi: break;
        }
        NumberValue phi = NumberValue::make_approx(constants::kPhi);
        phi.symbol = definition_.symbol;
        return phi;
    }

private:
    const constants::ConstantDefinition& definition_;
};

class VariableNode : public AstNode {
public:
    explicit VariableNode(std::string name) : name_(std::move(name)) {}

    NumberValue evaluate(const EvaluationContext& ctx) const override {
        if (const auto* value = ctx.get_variable(name_)) return *value;
        throw std::runtime_error("Unknown identifier: " + name_);
    }

private:
    std::string name_;
};

class InfinityNode : public AstNode {
public:
    explicit InfinityNode(bool negative = false) : negative_(negative) {}

    NumberValue evaluate(const EvaluationContext&) const override {
        throw std::runtime_error("Infinity is only valid as a calculus bound or limit target");
    }

    bool negative() const { return negative_; }

private:
    bool negative_;
};

class NegateNode : public AstNode {
public:
    explicit NegateNode(NodePtr operand) : operand_(std::move(operand)) {}

    NumberValue evaluate(const EvaluationContext& ctx) const override {
        NumberValue value = operand_->evaluate(ctx);
        value.negate();
        return value;
    }

private:
    NodePtr operand_;
};

class FactorialNode : public AstNode {
public:
    explicit FactorialNode(NodePtr operand) : operand_(std::move(operand)) {}

    NumberValue evaluate(const EvaluationContext& ctx) const override {
        return functions::eval_factorial(operand_->evaluate(ctx));
    }

private:
    NodePtr operand_;
};

class DegreeNode : public AstNode {
public:
    explicit DegreeNode(NodePtr operand) : operand_(std::move(operand)) {}

    // Exact conversion keeps special angles exact: 30° -> π/6.
    NumberValue evaluate(const EvaluationContext& ctx) const override {
        return multiply(operand_->evaluate(ctx), NumberValue::make_constant(Rational(1, 180), 1, 0));
    }

private:
    NodePtr operand_;
};

class BinaryOpNode : public AstNode {
public:
    BinaryOpNode(char op, NodePtr left, NodePtr right)
        : op_(op), left_(std::move(left)), right_(std::move(right)) {}

    NumberValue evaluate(const EvaluationContext& ctx) const override {
        const NumberValue left = left_->evaluate(ctx);
        const NumberValue right = right_->evaluate(ctx);
        switch (op_) {
            case '+': return add(left, right);
            case '-': return subtract(left, right);
            case '*': return multiply(left, right);
            case '/': return divide(left, right);
            case '^': return power(left, right);
        }
        throw std::runtime_error("Unknown binary operator");
    }

private:
    char op_;
    NodePtr left_;
    NodePtr right_;
};

class FunctionCallNode : public AstNode {
public:
    FunctionCallNode(const functions::FunctionSpec& spec, std::vector<NodePtr> args)
        : spec_(spec), args_(std::move(args)) {
        if (args_.size() < spec_.min_args || args_.size() > spec_.max_args) {
            throw std::runtime_error(functions::arity_message(spec_));
        }
    }

    NumberValue evaluate(const EvaluationContext& ctx) const override {
        if (args_.size() == 1) return spec_.unary(args_[0]->evaluate(ctx));
        return spec_.binary(args_[0]->evaluate(ctx), args_[1]->evaluate(ctx));
    }

private:
    const functions::FunctionSpec& spec_;
    std::vector<NodePtr> args_;
};

inline double evaluate_numeric(const AstNode& node, const EvaluationContext& ctx) {
    const NumberValue result = node.evaluate(ctx);
    const double value = result.to_double();
    if (!std::isfinite(value)) {
        if (result.is_large()) throw std::runtime_error("Finite result exceeds the native floating-point range");
        throw std::runtime_error("The result is not finite");
    }
    return value;
}

// Best rational p/q (q <= max_den) within tolerance, via continued fractions.
inline std::optional<Rational> find_rational_approximation(double value, long long max_den, double tolerance) {
    if (!std::isfinite(value) || std::fabs(value) > 1e12) return std::nullopt;
    const double sign = value < 0 ? -1.0 : 1.0;
    value = std::fabs(value);
    long long p0 = 0, q0 = 1, p1 = 1, q1 = 0;
    double remainder = value;
    for (int i = 0; i < 20; ++i) {
        const long long a = static_cast<long long>(std::floor(remainder));
        const long long p2 = a * p1 + p0;
        const long long q2 = a * q1 + q0;
        if (q2 > max_den) break;
        p0 = p1; q0 = q1; p1 = p2; q1 = q2;
        if (std::fabs(value - static_cast<double>(p1) / static_cast<double>(q1)) <= tolerance) {
            return Rational(static_cast<long long>(sign) * p1, q1);
        }
        const double fraction = remainder - static_cast<double>(a);
        if (fraction < 1e-14) break;
        remainder = 1.0 / fraction;
    }
    return std::nullopt;
}

// Numerical methods converge to ~1e-12; snap results that are that close to
// an integer or a small-denominator fraction so 8/3 is recognised as such.
inline NumberValue make_numerical_result(double value) {
    if (!std::isfinite(value)) {
        throw std::runtime_error("Numerical evaluation overflowed before finiteness could be determined");
    }
    const double scale = std::max(1.0, std::fabs(value));
    if (std::fabs(value) < 1e-12) return NumberValue::make_approx(0.0);
    if (std::fabs(value - std::round(value)) <= 1e-11 * scale) return NumberValue::make_approx(std::round(value));
    if (const auto rational = find_rational_approximation(value, 1000, 1e-11 * scale)) {
        return NumberValue::make_approx_with_rational(value, *rational);
    }
    return NumberValue::make_approx(value);
}

inline bool is_infinity(const AstNode& node) { return dynamic_cast<const InfinityNode*>(&node) != nullptr; }

class DefiniteIntegralNode : public AstNode {
public:
    DefiniteIntegralNode(NodePtr lower, NodePtr upper, std::string variable, NodePtr integrand)
        : lower_(std::move(lower)), upper_(std::move(upper)), variable_(std::move(variable)),
          integrand_(std::move(integrand)) {}

    NumberValue evaluate(const EvaluationContext& ctx) const override {
        if (is_infinity(*lower_) || is_infinity(*upper_)) {
            throw std::runtime_error("Infinite bounds are not supported for numerical integration");
        }
        const double lower = evaluate_numeric(*lower_, ctx);
        const double upper = evaluate_numeric(*upper_, ctx);
        if (lower == upper) return NumberValue(0);
        if (std::fabs(upper - lower) > 1e7) throw std::runtime_error("Integral interval is too large");

        const Sampler f{*this, ctx};
        const double a = std::min(lower, upper);
        const double b = std::max(lower, upper);
        const double fa = f(a);
        const double fm = f((a + b) / 2.0);
        const double fb = f(b);
        const double area = adaptive_simpson(f, a, b, fa, fm, fb, simpson(a, b, fa, fm, fb), 20);
        return make_numerical_result(upper >= lower ? area : -area);
    }

private:
    struct Sampler {
        const DefiniteIntegralNode& node;
        const EvaluationContext& ctx;
        double operator()(double x) const {
            return evaluate_numeric(*node.integrand_, ctx.bind(node.variable_, NumberValue::make_approx(x)));
        }
    };

    static double simpson(double left, double right, double f_left, double f_mid, double f_right) {
        return (right - left) * (f_left + 4.0 * f_mid + f_right) / 6.0;
    }

    static double adaptive_simpson(const Sampler& f, double left, double right, double f_left, double f_mid,
                                   double f_right, double whole, int depth) {
        const double mid = (left + right) / 2.0;
        const double f_left_mid = f((left + mid) / 2.0);
        const double f_right_mid = f((mid + right) / 2.0);
        const double left_area = simpson(left, mid, f_left, f_left_mid, f_mid);
        const double right_area = simpson(mid, right, f_mid, f_right_mid, f_right);
        const double refined = left_area + right_area;
        const double error = refined - whole;
        if (depth <= 0 || std::fabs(error) <= 15.0 * 1e-10 * (1.0 + std::fabs(refined))) {
            return refined + error / 15.0;
        }
        return adaptive_simpson(f, left, mid, f_left, f_left_mid, f_mid, left_area, depth - 1) +
               adaptive_simpson(f, mid, right, f_mid, f_right_mid, f_right, right_area, depth - 1);
    }

    NodePtr lower_;
    NodePtr upper_;
    std::string variable_;
    NodePtr integrand_;
};

class DerivativeNode : public AstNode {
public:
    // A null point evaluates at the variable's current value (0 when unbound),
    // which lets derivative(x, f(x)) be graphed as a function of x.
    DerivativeNode(int order, std::string variable, NodePtr point, NodePtr target)
        : order_(order), variable_(std::move(variable)), point_(std::move(point)), target_(std::move(target)) {
        if (order_ < 1 || order_ > 10) throw std::runtime_error("Derivative order must be between 1 and 10");
    }

    NumberValue evaluate(const EvaluationContext& ctx) const override {
        double x = 0.0;
        if (point_) x = evaluate_numeric(*point_, ctx);
        else if (const auto* bound = ctx.get_variable(variable_)) x = bound->to_double();
        return make_numerical_result(ridders(ctx, x));
    }

private:
    double sample(const EvaluationContext& ctx, double x) const {
        return evaluate_numeric(*target_, ctx.bind(variable_, NumberValue::make_approx(x)));
    }

    // Centered n-th difference: sum_k (-1)^k C(n,k) f(x + (n/2 - k) h) / h^n, error O(h^2).
    double central_difference(const EvaluationContext& ctx, double x, double h) const {
        double sum = 0.0;
        double binomial = 1.0;
        for (int k = 0; k <= order_; ++k) {
            const double offset = (static_cast<double>(order_) / 2.0 - k) * h;
            sum += (k % 2 == 0 ? binomial : -binomial) * sample(ctx, x + offset);
            binomial = binomial * (order_ - k) / (k + 1);
        }
        return sum / std::pow(h, order_);
    }

    // Ridders' method: Richardson-extrapolate the central difference over a
    // shrinking step and keep the entry with the smallest error estimate.
    double ridders(const EvaluationContext& ctx, double x) const {
        constexpr int kTable = 10;
        constexpr double kShrink = 1.4;
        constexpr double kShrink2 = kShrink * kShrink;
        std::array<std::array<double, kTable>, kTable> table{};

        double h = std::min(1.0, 0.1 * order_) * std::max(1.0, std::fabs(x));
        for (int attempt = 0;; ++attempt) {
            try {
                table[0][0] = central_difference(ctx, x, h);
                break;
            } catch (const std::runtime_error&) {
                // The initial stencil left the function's domain; tighten it.
                if (attempt == 30) throw;
                h /= 4.0;
            }
        }

        double best = table[0][0];
        double error = std::numeric_limits<double>::max();
        for (int i = 1; i < kTable; ++i) {
            h /= kShrink;
            table[0][i] = central_difference(ctx, x, h);
            double factor = kShrink2;
            for (int j = 1; j <= i; ++j) {
                table[j][i] = (table[j - 1][i] * factor - table[j - 1][i - 1]) / (factor - 1.0);
                factor *= kShrink2;
                const double estimate = std::max(std::fabs(table[j][i] - table[j - 1][i]),
                                                 std::fabs(table[j][i] - table[j - 1][i - 1]));
                if (estimate <= error) {
                    error = estimate;
                    best = table[j][i];
                }
            }
            if (std::fabs(table[i][i] - table[i - 1][i - 1]) >= 2.0 * error) break;
        }
        return best;
    }

    int order_;
    std::string variable_;
    NodePtr point_;
    NodePtr target_;
};

class LimitNode : public AstNode {
public:
    enum class Side { Both, Left, Right };

    LimitNode(std::string variable, NodePtr target, NodePtr expression, Side side)
        : variable_(std::move(variable)), target_(std::move(target)), expression_(std::move(expression)),
          side_(side) {}

    NumberValue evaluate(const EvaluationContext& ctx) const override {
        const auto* infinity = dynamic_cast<const InfinityNode*>(target_.get());
        if (infinity) return finish(approach(ctx, 0.0, infinity->negative() ? -1.0 : 1.0, true));

        const double target = evaluate_numeric(*target_, ctx);
        if (side_ == Side::Left) return finish(approach(ctx, target, -1.0, false));
        if (side_ == Side::Right) return finish(approach(ctx, target, 1.0, false));

        const Estimate left = approach(ctx, target, -1.0, false);
        const Estimate right = approach(ctx, target, 1.0, false);
        if (left.divergence != 0 || right.divergence != 0) {
            if (left.divergence == right.divergence) return finish(left);
            throw std::runtime_error("Limit does not converge");
        }
        if (std::fabs(left.value - right.value) > 1e-7 * (1.0 + std::fabs(left.value) + std::fabs(right.value))) {
            throw std::runtime_error("Limit does not converge");
        }
        return finish(Estimate{(left.value + right.value) / 2.0, std::max(left.error, right.error), 0});
    }

private:
    static constexpr int kSteps = 28;

    struct Estimate {
        double value;
        double error;
        int divergence;  // +1 / -1 when the samples grow without bound
    };

    static NumberValue finish(const Estimate& estimate) {
        if (estimate.divergence > 0) throw std::runtime_error("Limit diverges to infinity");
        if (estimate.divergence < 0) throw std::runtime_error("Limit diverges to -infinity");
        if (!(estimate.error <= 1e-6 * (1.0 + std::fabs(estimate.value)))) {
            throw std::runtime_error("Limit does not converge");
        }
        // An integer within the extrapolation's own error bar is the answer.
        const double nearest = std::round(estimate.value);
        if (std::fabs(estimate.value - nearest) <= 2.0 * estimate.error) return make_numerical_result(nearest);
        return make_numerical_result(estimate.value);
    }

    // Samples f along a geometric sequence approaching the target (step h
    // halving from 0.1 * scale; for infinity x = direction / h) and
    // Richardson-extrapolates in h, keeping the entry with the smallest error
    // estimate. Starting far out keeps roundoff-dominated samples, such as
    // (1 - cos x) / x^2 near 0, out of the extrapolation.
    Estimate approach(const EvaluationContext& ctx, double target, double direction, bool to_infinity) const {
        std::array<double, kSteps> samples{};
        const double scale = 0.1 * std::max(1.0, std::fabs(target));
        int count = 0;
        for (; count < kSteps; ++count) {
            const double h = std::ldexp(scale, -count);
            const double x = to_infinity ? direction / std::ldexp(0.1, -count) : target + direction * h;
            try {
                samples[count] = evaluate_numeric(*expression_, ctx.bind(variable_, NumberValue::make_approx(x)));
            } catch (const std::runtime_error&) {
                // Overflow close to the target (e^x as x -> infinity) is judged
                // from the samples gathered so far.
                if (count < 4) throw;
                break;
            }
        }

        const int last = count - 1;
        int growth = 0;
        for (int i = last - 3; i < last; ++i) {
            if (std::fabs(samples[i + 1]) > 1.5 * std::fabs(samples[i]) &&
                (samples[i + 1] > 0.0) == (samples[i] > 0.0)) {
                ++growth;
            }
        }
        if (growth == 3 && (std::fabs(samples[last]) > 1e6 || count < kSteps)) {
            return Estimate{0.0, 0.0, samples[last] > 0.0 ? 1 : -1};
        }

        const Estimate polynomial = richardson(samples, count);
        const Estimate fractional = iterated_aitken(samples, count);
        return fractional.error < polynomial.error ? fractional : polynomial;
    }

    // Error terms in integer powers of h (smooth functions).
    static Estimate richardson(const std::array<double, kSteps>& samples, int count) {
        std::array<std::array<double, kSteps>, kSteps> table{};
        double best = samples[0];
        double error = std::numeric_limits<double>::infinity();
        table[0][0] = samples[0];
        for (int i = 1; i < count; ++i) {
            table[0][i] = samples[i];
            double factor = 2.0;
            for (int j = 1; j <= i; ++j) {
                table[j][i] = (table[j - 1][i] * factor - table[j - 1][i - 1]) / (factor - 1.0);
                factor *= 2.0;
                const double estimate = std::max(std::fabs(table[j][i] - table[j - 1][i]),
                                                 std::fabs(table[j][i] - table[j - 1][i - 1]));
                if (estimate <= error) {
                    error = estimate;
                    best = table[j][i];
                }
            }
            if (std::fabs(table[i][i] - table[i - 1][i - 1]) >= 2.0 * error) break;
        }
        return Estimate{best, error, 0};
    }

    // Error terms in arbitrary powers of h, such as sqrt(x - 1) as x -> 1+:
    // on a geometric h sequence each term is geometric, which Aitken's
    // delta-squared process removes one at a time.
    static Estimate iterated_aitken(std::array<double, kSteps> values, int count) {
        // Only the prefix whose differences still shrink is convergence; once
        // they grow, cancellation noise dominates (e.g. 1 - cos x for tiny x).
        for (int i = 2; i < count; ++i) {
            if (std::fabs(values[i] - values[i - 1]) > std::fabs(values[i - 1] - values[i - 2])) {
                count = i;
                break;
            }
        }
        double best = values[count - 1];
        double error = std::numeric_limits<double>::infinity();
        for (int depth = 0; depth < 3 && count >= 3; ++depth) {
            for (int i = 0; i + 2 < count; ++i) {
                const double d1 = values[i + 1] - values[i];
                const double d2 = values[i + 2] - values[i + 1];
                const double curvature = d2 - d1;
                values[i] = curvature == 0.0 ? values[i + 2] : values[i + 2] - d2 * d2 / curvature;
            }
            count -= 2;
            for (int i = 1; i + 1 < count; ++i) {
                const double estimate = std::max(std::fabs(values[i] - values[i - 1]),
                                                 std::fabs(values[i + 1] - values[i]));
                if (estimate < error) {
                    error = estimate;
                    best = values[i];
                }
            }
        }
        return Estimate{best, error, 0};
    }

    std::string variable_;
    NodePtr target_;
    NodePtr expression_;
    Side side_;
};

class IterationNode : public AstNode {
public:
    enum class Kind { Sum, Product };

    IterationNode(Kind kind, std::string variable, NodePtr lower, NodePtr upper, NodePtr body)
        : kind_(kind), variable_(std::move(variable)), lower_(std::move(lower)), upper_(std::move(upper)),
          body_(std::move(body)) {}

    NumberValue evaluate(const EvaluationContext& ctx) const override {
        if (is_infinity(*lower_) || is_infinity(*upper_)) throw std::runtime_error("Infinite bounds are not supported");
        const NumberValue low = lower_->evaluate(ctx);
        const NumberValue high = upper_->evaluate(ctx);
        if (!low.is_integer()) throw std::runtime_error("Lower bound must be an integer");
        if (!high.is_integer()) throw std::runtime_error("Upper bound must be an integer");
        const long long a = low.to_integer();
        const long long b = high.to_integer();
        if (a > b) throw std::runtime_error("Lower bound cannot be greater than upper bound");
        if (b - a > 1000000) throw std::runtime_error(kUnreasonableComputation);

        NumberValue accumulator(kind_ == Kind::Sum ? 0 : 1);
        for (long long i = a; i <= b; ++i) {
            const NumberValue term = body_->evaluate(ctx.bind(variable_, NumberValue(i)));
            accumulator = kind_ == Kind::Sum ? add(accumulator, term) : multiply(accumulator, term);
        }
        return accumulator;
    }

private:
    Kind kind_;
    std::string variable_;
    NodePtr lower_;
    NodePtr upper_;
    NodePtr body_;
};

} // namespace lluna::core
