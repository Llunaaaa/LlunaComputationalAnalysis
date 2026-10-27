#pragma once

#include "token.hpp"
#include "ast.hpp"
#include "../constants/constants.hpp"
#include "../functions/functions.hpp"
#include <vector>
#include <memory>
#include <stdexcept>

namespace lluna::core {

class Parser {
public:
    explicit Parser(std::vector<Token> tokens) : tokens_(std::move(tokens)), pos_(0) {}

    std::unique_ptr<AstNode> parse() {
        if (check(TokenType::Eof)) {
            throw std::runtime_error("Enter an expression");
        }

        auto node = parse_expression();

        if (!check(TokenType::Eof)) {
            throw std::runtime_error("Unexpected character in expression");
        }

        return node;
    }

private:
    std::unique_ptr<AstNode> parse_expression() {
        auto left = parse_term();

        while (match(TokenType::Plus) || match(TokenType::Minus)) {
            char op = previous().type == TokenType::Plus ? '+' : '-';
            auto right = parse_term();
            left = std::make_unique<BinaryOpNode>(op, std::move(left), std::move(right));
        }

        return left;
    }

    std::unique_ptr<AstNode> parse_term() {
        auto left = parse_unary();

        while (true) {
            if (match(TokenType::Star) || match(TokenType::Slash)) {
                char op = previous().type == TokenType::Star ? '*' : '/';
                auto right = parse_unary();
                left = std::make_unique<BinaryOpNode>(op, std::move(left), std::move(right));
                continue;
            }

            // Implicit Multiplication (Juxtaposition)
            // If the next token can start a factor/primary without an explicit operator
            if (can_start_primary(peek())) {
                auto right = parse_unary();
                left = std::make_unique<BinaryOpNode>('*', std::move(left), std::move(right));
                continue;
            }

            break;
        }

        return left;
    }

    std::unique_ptr<AstNode> parse_unary() {
        if (match(TokenType::Plus)) {
            return parse_unary();
        }

        if (match(TokenType::Minus)) {
            // Unary minus binds looser than exponentiation so -3^2 is -(3^2) = -9
            auto operand = parse_power();
            return std::make_unique<UnaryOpNode>('-', std::move(operand));
        }

        return parse_power();
    }

    std::unique_ptr<AstNode> parse_power() {
        auto left = parse_postfix();

        if (match(TokenType::Caret)) {
            // Exponentiation is right-associative: 2^3^2 is 2^(3^2)
            auto right = parse_unary();
            return std::make_unique<BinaryOpNode>('^', std::move(left), std::move(right));
        }

        return left;
    }

    std::unique_ptr<AstNode> parse_postfix() {
        auto node = parse_primary();

        while (match(TokenType::Exclamation)) {
            node = std::make_unique<PostfixOpNode>('!', std::move(node));
        }

        return node;
    }

    std::unique_ptr<AstNode> parse_primary() {
        if (match(TokenType::Number)) {
            return std::make_unique<NumberNode>(previous().number_value);
        }

        if (match(TokenType::LParen)) {
            auto inner = parse_expression();
            consume(TokenType::RParen, "Missing closing parenthesis");
            return inner;
        }

        if (match(TokenType::Identifier)) {
            std::string name = previous().text;

            // Check if it's a known mathematical constant
            const auto* c = constants::find_constant(name);
            if (c) {
                return std::make_unique<ConstantNode>(c);
            }

            // Check if it's a known mathematical function
            if (functions::is_function_name(name)) {
                return parse_function_call(name);
            }

            throw std::runtime_error("Unknown identifier: " + name);
        }

        throw std::runtime_error("Expected a number");
    }

    std::unique_ptr<AstNode> parse_function_call(const std::string& name) {
        std::vector<std::unique_ptr<AstNode>> args;

        // Functions take arguments in parentheses: e.g. sqrt(16), log(2)(8), log(100)
        consume(TokenType::LParen, name + " requires an expression in parentheses");
        args.push_back(parse_expression());
        while (match(TokenType::Comma)) {
            args.push_back(parse_expression());
        }
        consume(TokenType::RParen, "Missing closing parenthesis");

        // Handle chained parentheses like root(3)(27) or log(2)(8)
        if (match(TokenType::LParen)) {
            args.push_back(parse_expression());
            while (match(TokenType::Comma)) {
                args.push_back(parse_expression());
            }
            consume(TokenType::RParen, "Missing closing parenthesis");
        }

        return std::make_unique<FunctionCallNode>(name, std::move(args));
    }

    bool can_start_primary(const Token& t) const {
        return t.type == TokenType::Number ||
               t.type == TokenType::Identifier ||
               t.type == TokenType::LParen;
    }

    bool match(TokenType type) {
        if (check(type)) {
            advance();
            return true;
        }
        return false;
    }

    bool check(TokenType type) const {
        if (is_at_end()) return type == TokenType::Eof;
        return peek().type == type;
    }

    Token advance() {
        if (!is_at_end()) pos_++;
        return previous();
    }

    bool is_at_end() const {
        return pos_ >= tokens_.size() || tokens_[pos_].type == TokenType::Eof;
    }

    const Token& peek() const {
        return tokens_[pos_];
    }

    const Token& previous() const {
        return tokens_[pos_ - 1];
    }

    Token consume(TokenType type, const std::string& message) {
        if (check(type)) return advance();
        throw std::runtime_error(message);
    }

    std::vector<Token> tokens_;
    std::size_t pos_;
};

} // namespace lluna::core
