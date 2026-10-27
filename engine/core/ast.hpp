#pragma once

#include "../constants/constants.hpp"
#include "../functions/functions.hpp"
#include <memory>
#include <string>
#include <vector>
#include <stdexcept>
#include <cmath>

namespace lluna::core {

class AstNode {
public:
    virtual ~AstNode() = default;
    virtual functions::FunctionResult evaluate() const = 0;
};

class NumberNode : public AstNode {
public:
    explicit NumberNode(double value) : value_(value) {}

    functions::FunctionResult evaluate() const override {
        return {value_, false, ""};
    }

private:
    double value_;
};

class ConstantNode : public AstNode {
public:
    explicit ConstantNode(const constants::ConstantDefinition* def) : def_(def) {}

    functions::FunctionResult evaluate() const override {
        if (!def_) throw std::runtime_error("Unknown constant");
        return {def_->compute(), def_->is_irrational, def_->symbol};
    }

    const std::string& symbol() const {
        return def_->symbol;
    }

private:
    const constants::ConstantDefinition* def_;
};

class UnaryOpNode : public AstNode {
public:
    UnaryOpNode(char op, std::unique_ptr<AstNode> operand)
        : op_(op), operand_(std::move(operand)) {}

    functions::FunctionResult evaluate() const override {
        auto res = operand_->evaluate();
        if (op_ == '-') {
            res.value = -res.value;
        }
        return res;
    }

private:
    char op_;
    std::unique_ptr<AstNode> operand_;
};

class PostfixOpNode : public AstNode {
public:
    PostfixOpNode(char op, std::unique_ptr<AstNode> operand)
        : op_(op), operand_(std::move(operand)) {}

    functions::FunctionResult evaluate() const override {
        auto res = operand_->evaluate();
        if (op_ == '!') {
            return functions::eval_factorial(res.value);
        }
        throw std::runtime_error("Unknown postfix operator");
    }

private:
    char op_;
    std::unique_ptr<AstNode> operand_;
};

class BinaryOpNode : public AstNode {
public:
    BinaryOpNode(char op, std::unique_ptr<AstNode> left, std::unique_ptr<AstNode> right)
        : op_(op), left_(std::move(left)), right_(std::move(right)) {}

    functions::FunctionResult evaluate() const override {
        auto l = left_->evaluate();
        auto r = right_->evaluate();
        bool is_approx = l.is_approximate || r.is_approximate;
        double val = 0.0;

        switch (op_) {
            case '+':
                val = l.value + r.value;
                break;
            case '-':
                val = l.value - r.value;
                break;
            case '*':
                val = l.value * r.value;
                break;
            case '/':
                if (r.value == 0.0) {
                    throw std::runtime_error("Cannot divide by zero");
                }
                val = l.value / r.value;
                if (std::fmod(l.value, r.value) != 0.0) {
                    is_approx = true;
                }
                break;
            case '^':
                val = std::pow(l.value, r.value);
                if (!std::isfinite(val)) {
                    throw std::runtime_error("The result is not finite");
                }
                if (val != std::floor(val)) {
                    is_approx = true;
                }
                break;
            default:
                throw std::runtime_error("Unknown binary operator");
        }

        if (!std::isfinite(val)) {
            throw std::runtime_error("The result is not finite");
        }

        return {val, is_approx, ""};
    }

private:
    char op_;
    std::unique_ptr<AstNode> left_;
    std::unique_ptr<AstNode> right_;
};

class FunctionCallNode : public AstNode {
public:
    FunctionCallNode(const std::string& name, std::vector<std::unique_ptr<AstNode>> args)
        : name_(name), args_(std::move(args)) {}

    functions::FunctionResult evaluate() const override {
        if (name_ == "sqrt") {
            if (args_.size() != 1) {
                throw std::runtime_error("sqrt requires exactly 1 argument");
            }
            auto arg = args_[0]->evaluate();
            auto res = functions::eval_sqrt(arg.value);
            return {res.value, res.is_approximate || arg.is_approximate, res.exact_repr};
        }

        if (name_ == "root") {
            if (args_.size() != 2) {
                throw std::runtime_error("root requires index and argument");
            }
            auto idx = args_[0]->evaluate();
            auto arg = args_[1]->evaluate();
            auto res = functions::eval_root(idx.value, arg.value);
            return {res.value, res.is_approximate || idx.is_approximate || arg.is_approximate, res.exact_repr};
        }

        if (name_ == "log") {
            if (args_.size() == 1) {
                // Default base 10
                auto arg = args_[0]->evaluate();
                auto res = functions::eval_log(10.0, arg.value);
                return {res.value, res.is_approximate || arg.is_approximate, res.exact_repr};
            }
            if (args_.size() == 2) {
                auto base = args_[0]->evaluate();
                auto arg = args_[1]->evaluate();
                auto res = functions::eval_log(base.value, arg.value);
                return {res.value, res.is_approximate || base.is_approximate || arg.is_approximate, res.exact_repr};
            }
            throw std::runtime_error("log requires 1 or 2 arguments");
        }

        if (name_ == "ln") {
            if (args_.size() != 1) {
                throw std::runtime_error("ln requires exactly 1 argument");
            }
            auto arg = args_[0]->evaluate();
            auto res = functions::eval_ln(arg.value);
            return {res.value, res.is_approximate || arg.is_approximate, res.exact_repr};
        }

        throw std::runtime_error("Unknown function: " + name_);
    }

private:
    std::string name_;
    std::vector<std::unique_ptr<AstNode>> args_;
};

} // namespace lluna::core
