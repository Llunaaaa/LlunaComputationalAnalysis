#pragma once

#include "token.hpp"
#include "ast.hpp"
#include "../constants/constants.hpp"
#include "../functions/functions.hpp"
#include <algorithm>
#include <limits>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace lluna::core {

// Grammar (lowest to highest precedence):
//   expression := term (('+' | '-') term)*
//   term       := unary (('*' | '/' | <implicit>) unary)*
//   unary      := ('+' | '-') unary | power        -3^2 = -(3^2)
//   power      := postfix ('^' unary)?             right associative
//   postfix    := primary ('!' | '°')*
class Parser {
public:
    explicit Parser(std::vector<Token> tokens) : tokens_(std::move(tokens)) {}

    NodePtr parse() {
        if (check(TokenType::Eof)) throw std::runtime_error("Enter an expression");
        NodePtr node = parse_expression();
        if (!check(TokenType::Eof)) throw std::runtime_error("Unexpected character in expression");
        return node;
    }

private:
    // Keeps a calculus variable in scope while its body is parsed, so it
    // shadows constants such as e and participates in identifier splitting.
    class ScopedBinding {
    public:
        ScopedBinding(std::vector<std::string>& scopes, const std::string& name) : scopes_(scopes) {
            scopes_.push_back(name);
        }
        ~ScopedBinding() { scopes_.pop_back(); }
        ScopedBinding(const ScopedBinding&) = delete;
        ScopedBinding& operator=(const ScopedBinding&) = delete;

    private:
        std::vector<std::string>& scopes_;
    };

    NodePtr parse_expression() {
        NodePtr left = parse_term();
        while (check(TokenType::Plus) || check(TokenType::Minus)) {
            const char op = advance().type == TokenType::Plus ? '+' : '-';
            left = std::make_unique<BinaryOpNode>(op, std::move(left), parse_term());
        }
        return left;
    }

    NodePtr parse_term() {
        NodePtr left = parse_unary();
        while (true) {
            if (check(TokenType::Star) || check(TokenType::Slash)) {
                const char op = advance().type == TokenType::Star ? '*' : '/';
                left = std::make_unique<BinaryOpNode>(op, std::move(left), parse_unary());
            } else if (can_start_primary(peek())) {
                left = std::make_unique<BinaryOpNode>('*', std::move(left), parse_unary());
            } else {
                return left;
            }
        }
    }

    NodePtr parse_unary() {
        if (match(TokenType::Plus)) return parse_unary();
        if (match(TokenType::Minus)) {
            if (match(TokenType::Infinity)) return std::make_unique<InfinityNode>(true);
            if (check(TokenType::Identifier) && is_infinity_name(peek().text) && !is_bound(peek().text)) {
                advance();
                return std::make_unique<InfinityNode>(true);
            }
            return std::make_unique<NegateNode>(parse_power());
        }
        return parse_power();
    }

    NodePtr parse_power() {
        NodePtr base = parse_postfix();
        if (match(TokenType::Caret)) return std::make_unique<BinaryOpNode>('^', std::move(base), parse_unary());
        return base;
    }

    NodePtr parse_postfix() {
        NodePtr node = parse_primary();
        while (true) {
            if (match(TokenType::Exclamation)) node = std::make_unique<FactorialNode>(std::move(node));
            else if (match(TokenType::Degree)) node = std::make_unique<DegreeNode>(std::move(node));
            else return node;
        }
    }

    NodePtr parse_primary() {
        if (match(TokenType::Number)) return std::make_unique<NumberNode>(previous().text, previous().number_value);
        if (match(TokenType::Infinity)) return std::make_unique<InfinityNode>();
        if (match(TokenType::LParen)) {
            NodePtr inner = parse_expression();
            consume(TokenType::RParen, "Missing closing parenthesis");
            return inner;
        }
        if (match(TokenType::Pipe)) {
            ++open_pipes_;
            std::vector<NodePtr> args;
            args.push_back(parse_expression());
            consume(TokenType::Pipe, "Missing closing pipe for absolute value");
            --open_pipes_;
            return std::make_unique<FunctionCallNode>(*functions::find_function("abs"), std::move(args));
        }
        if (match(TokenType::Identifier)) return parse_identifier(previous().text);
        throw std::runtime_error("Expected a number");
    }

    NodePtr parse_identifier(const std::string& name) {
        if (is_bound(name)) return std::make_unique<VariableNode>(name);
        if (is_infinity_name(name)) return std::make_unique<InfinityNode>();
        if (name == "integral" || name == "int") return parse_integral();
        if (name == "derivative" || name == "diff") return parse_derivative(false);
        if (name == "derivative_n" || name == "diff_n") return parse_derivative(true);
        if (name == "limit") return parse_limit();
        if (name == "sum" || name == "prod") return parse_iteration(name);
        if (const auto* constant = constants::find_constant(name)) return std::make_unique<ConstantNode>(*constant);
        if (const auto* function = functions::find_function(name)) return parse_function_call(*function);
        return split_identifier(name);
    }

    // integral(lower, upper, [variable,] integrand). An identifier followed by a
    // comma is always the variable here, even one that names a constant.
    NodePtr parse_integral() {
        consume(TokenType::LParen, "Integral requires arguments in parentheses: integral(lower, upper, variable, integrand)");
        NodePtr lower = parse_expression();
        consume(TokenType::Comma, "Expected ',' after integral lower bound");
        NodePtr upper = parse_expression();
        consume(TokenType::Comma, "Expected ',' after integral upper bound");
        const std::string variable = parse_optional_variable("x", true);
        NodePtr body;
        {
            ScopedBinding binding(bound_, variable);
            body = parse_expression();
        }
        consume(TokenType::RParen, "Missing closing parenthesis in integral");
        return std::make_unique<DefiniteIntegralNode>(std::move(lower), std::move(upper), variable, std::move(body));
    }

    // derivative([variable,] [point,] body) and derivative_n(order, [variable,] [point,] body)
    NodePtr parse_derivative(bool with_order) {
        consume(TokenType::LParen, with_order
            ? "Derivative requires arguments in parentheses: derivative_n(order, variable, point, body)"
            : "Derivative requires arguments in parentheses: derivative(variable, point, body)");
        int order = 1;
        if (with_order) {
            const NumberValue value = parse_expression()->evaluate();
            if (!value.is_integer()) throw std::runtime_error("Derivative order must be an integer");
            const long long requested = value.to_integer();
            order = static_cast<int>(std::clamp<long long>(requested, std::numeric_limits<int>::min(),
                                                           std::numeric_limits<int>::max()));
            consume(TokenType::Comma, "Expected ',' after derivative order");
        }
        const std::string variable = parse_optional_variable("x");
        NodePtr point;
        NodePtr body;
        {
            ScopedBinding binding(bound_, variable);
            body = parse_expression();
            if (match(TokenType::Comma)) {
                point = std::move(body);
                body = parse_expression();
            }
        }
        consume(TokenType::RParen, "Missing closing parenthesis in derivative");
        return std::make_unique<DerivativeNode>(order, variable, std::move(point), std::move(body));
    }

    // limit([variable,] target, [left | right,] body)
    NodePtr parse_limit() {
        consume(TokenType::LParen, "Limit requires arguments in parentheses: limit(variable, target, body)");
        const std::string variable = parse_optional_variable("x");
        NodePtr target = parse_expression();
        consume(TokenType::Comma, "Expected ',' after limit target");
        LimitNode::Side side = LimitNode::Side::Both;
        if (check(TokenType::Identifier) && (peek().text == "left" || peek().text == "right") &&
            peek_type(1) == TokenType::Comma) {
            side = advance().text == "left" ? LimitNode::Side::Left : LimitNode::Side::Right;
            advance();
        }
        NodePtr body;
        {
            ScopedBinding binding(bound_, variable);
            body = parse_expression();
        }
        consume(TokenType::RParen, "Missing closing parenthesis in limit");
        return std::make_unique<LimitNode>(variable, std::move(target), std::move(body), side);
    }

    // sum(i, lower, upper, body) or sum(i, lower, upper)(body); likewise prod.
    NodePtr parse_iteration(const std::string& name) {
        consume(TokenType::LParen, name + " requires arguments in parentheses");
        const std::string variable = consume(TokenType::Identifier, name + " requires an index variable").text;
        consume(TokenType::Comma, "Expected ',' after variable name in " + name);
        NodePtr lower = parse_expression();
        consume(TokenType::Comma, "Expected ',' after lower bound in " + name);
        NodePtr upper = parse_expression();
        NodePtr body;
        if (match(TokenType::Comma)) {
            ScopedBinding binding(bound_, variable);
            body = parse_expression();
            consume(TokenType::RParen, "Missing closing parenthesis in " + name);
        } else {
            consume(TokenType::RParen, "Missing closing parenthesis in " + name);
            consume(TokenType::LParen, name + " requires target expression in parentheses");
            ScopedBinding binding(bound_, variable);
            body = parse_expression();
            consume(TokenType::RParen, "Missing closing parenthesis around target expression in " + name);
        }
        const auto kind = name == "sum" ? IterationNode::Kind::Sum : IterationNode::Kind::Product;
        return std::make_unique<IterationNode>(kind, variable, std::move(lower), std::move(upper), std::move(body));
    }

    // For derivative and limit the leading identifier may instead be a point
    // such as pi, so constants only count as variables where unambiguous.
    std::string parse_optional_variable(const char* fallback, bool allow_constants = false) {
        if (check(TokenType::Identifier) && peek_type(1) == TokenType::Comma) {
            const std::string name = peek().text;
            if (allow_constants || !constants::is_constant_name(name) || is_bound(name)) {
                advance();
                advance();
                return name;
            }
        }
        return fallback;
    }

    // name(args) with an optional chained group: root(3)(27), log(2)(8).
    NodePtr parse_function_call(const functions::FunctionSpec& function) {
        std::vector<NodePtr> args;
        consume(TokenType::LParen, std::string(function.name) + " requires an expression in parentheses");
        parse_argument_list(args);
        if (match(TokenType::LParen)) parse_argument_list(args);
        return std::make_unique<FunctionCallNode>(function, std::move(args));
    }

    void parse_argument_list(std::vector<NodePtr>& args) {
        args.push_back(parse_expression());
        while (match(TokenType::Comma)) args.push_back(parse_expression());
        consume(TokenType::RParen, "Missing closing parenthesis");
    }

    // Juxtaposed names such as "pie" or "xsin(" are split into the fewest known
    // atoms (bound variables and constants, plus a trailing function name when
    // a call follows). Anything else stays a single unknown identifier.
    NodePtr split_identifier(const std::string& name) {
        const size_t n = name.size();
        const bool call_follows = check(TokenType::LParen);
        constexpr int kNone = std::numeric_limits<int>::max();
        std::vector<int> atoms(n + 1, kNone);
        std::vector<size_t> next(n + 1, 0);
        atoms[n] = 0;
        for (size_t start = n; start-- > 0;) {
            for (size_t end = n; end > start; --end) {
                if (atoms[end] == kNone) continue;
                const std::string part = name.substr(start, end - start);
                const bool known = is_bound(part) || constants::is_constant_name(part) ||
                                   (end == n && call_follows && functions::is_function_name(part));
                if (known && atoms[end] + 1 < atoms[start]) {
                    atoms[start] = atoms[end] + 1;
                    next[start] = end;
                }
            }
        }
        if (atoms[0] == kNone || atoms[0] < 2) return std::make_unique<VariableNode>(name);

        NodePtr product;
        for (size_t start = 0; start < n; start = next[start]) {
            const std::string part = name.substr(start, next[start] - start);
            NodePtr factor;
            if (is_bound(part)) factor = std::make_unique<VariableNode>(part);
            else if (const auto* constant = constants::find_constant(part)) factor = std::make_unique<ConstantNode>(*constant);
            else factor = parse_function_call(*functions::find_function(part));
            product = product ? std::make_unique<BinaryOpNode>('*', std::move(product), std::move(factor))
                              : std::move(factor);
        }
        return product;
    }

    static bool is_infinity_name(const std::string& name) {
        return name == "infinity" || name == "inf" || name == "oo";
    }

    bool is_bound(const std::string& name) const {
        return std::find(bound_.rbegin(), bound_.rend(), name) != bound_.rend();
    }

    bool can_start_primary(const Token& token) const {
        switch (token.type) {
            case TokenType::Pipe: return open_pipes_ == 0;
            case TokenType::Number:
            case TokenType::Identifier:
            case TokenType::Infinity:
            case TokenType::LParen: return true;
            default: return false;
        }
    }

    bool match(TokenType type) {
        if (!check(type)) return false;
        advance();
        return true;
    }

    bool check(TokenType type) const { return peek().type == type; }

    TokenType peek_type(size_t offset) const {
        return pos_ + offset < tokens_.size() ? tokens_[pos_ + offset].type : TokenType::Eof;
    }

    const Token& advance() {
        if (peek().type != TokenType::Eof) ++pos_;
        return previous();
    }

    const Token& peek() const { return tokens_[std::min(pos_, tokens_.size() - 1)]; }
    const Token& previous() const { return tokens_[pos_ - 1]; }

    const Token& consume(TokenType type, const std::string& message) {
        if (check(type)) return advance();
        throw std::runtime_error(message);
    }

    std::vector<Token> tokens_;
    size_t pos_ = 0;
    int open_pipes_ = 0;
    std::vector<std::string> bound_;
};

} // namespace lluna::core
