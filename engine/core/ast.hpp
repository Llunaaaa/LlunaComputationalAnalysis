#pragma once

#include "number_value.hpp"
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
    virtual NumberValue evaluate() const = 0;
};

class NumberNode : public AstNode {
public:
    explicit NumberNode(std::string text, double value)
        : text_(std::move(text)), value_(value) {}

    NumberValue evaluate() const override {
        return NumberValue::from_literal(text_, value_);
    }

private:
    std::string text_;
    double value_;
};

class ConstantNode : public AstNode {
public:
    explicit ConstantNode(const constants::ConstantDefinition* def) : def_(def) {}

    NumberValue evaluate() const override {
        if (!def_) throw std::runtime_error("Unknown constant");
        if (def_->name == "pi" || def_->name == "π") {
            return NumberValue::make_pi();
        }
        if (def_->name == "e") {
            return NumberValue::make_e();
        }
        return NumberValue(def_->compute(), def_->is_irrational, def_->symbol);
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

    NumberValue evaluate() const override {
        auto res = operand_->evaluate();
        if (op_ == '-') {
            res.negate();
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

    NumberValue evaluate() const override {
        auto res = operand_->evaluate();
        if (op_ == '!') {
            return functions::eval_factorial(res);
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

    NumberValue evaluate() const override {
        auto l = left_->evaluate();
        auto r = right_->evaluate();

        switch (op_) {
            case '+':
                return add(l, r);
            case '-':
                return subtract(l, r);
            case '*':
                return multiply(l, r);
            case '/':
                return divide(l, r);
            case '^':
                return power(l, r);
            default:
                throw std::runtime_error("Unknown binary operator");
        }
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

    NumberValue evaluate() const override {
        if (name_ == "sqrt") {
            if (args_.size() != 1) {
                throw std::runtime_error("sqrt requires exactly 1 argument");
            }
            auto arg = args_[0]->evaluate();
            return functions::eval_sqrt(arg);
        }

        if (name_ == "root") {
            if (args_.size() != 2) {
                throw std::runtime_error("root requires index and argument");
            }
            auto idx = args_[0]->evaluate();
            auto arg = args_[1]->evaluate();
            return functions::eval_root(idx, arg);
        }

        if (name_ == "log") {
            if (args_.size() == 1) {
                // Default base 10
                auto arg = args_[0]->evaluate();
                return functions::eval_log(NumberValue(10.0), arg);
            }
            if (args_.size() == 2) {
                auto base = args_[0]->evaluate();
                auto arg = args_[1]->evaluate();
                return functions::eval_log(base, arg);
            }
            throw std::runtime_error("log requires 1 or 2 arguments");
        }

        if (name_ == "ln") {
            if (args_.size() != 1) {
                throw std::runtime_error("ln requires exactly 1 argument");
            }
            auto arg = args_[0]->evaluate();
            return functions::eval_ln(arg);
        }

        if (name_ == "abs") {
            if (args_.size() != 1) {
                throw std::runtime_error("abs requires exactly 1 argument");
            }
            auto arg = args_[0]->evaluate();
            return functions::eval_abs(arg);
        }

        if (name_ == "gcd") {
            if (args_.size() != 2) {
                throw std::runtime_error("gcd requires exactly 2 arguments");
            }
            auto a = args_[0]->evaluate();
            auto b = args_[1]->evaluate();
            return functions::eval_gcd(a, b);
        }

        if (name_ == "lcm") {
            if (args_.size() != 2) {
                throw std::runtime_error("lcm requires exactly 2 arguments");
            }
            auto a = args_[0]->evaluate();
            auto b = args_[1]->evaluate();
            return functions::eval_lcm(a, b);
        }

        if (name_ == "mod") {
            if (args_.size() != 2) {
                throw std::runtime_error("mod requires exactly 2 arguments");
            }
            auto a = args_[0]->evaluate();
            auto b = args_[1]->evaluate();
            return functions::eval_mod(a, b);
        }

        if (name_ == "nCr" || name_ == "comb") {
            if (args_.size() != 2) {
                throw std::runtime_error("nCr requires n and r arguments");
            }
            auto n = args_[0]->evaluate();
            auto r = args_[1]->evaluate();
            return functions::eval_nCr(n, r);
        }

        if (name_ == "nPr" || name_ == "perm") {
            if (args_.size() != 2) {
                throw std::runtime_error("nPr requires n and r arguments");
            }
            auto n = args_[0]->evaluate();
            auto r = args_[1]->evaluate();
            return functions::eval_nPr(n, r);
        }

        throw std::runtime_error("Unknown function: " + name_);
    }

private:
    std::string name_;
    std::vector<std::unique_ptr<AstNode>> args_;
};

} // namespace lluna::core
