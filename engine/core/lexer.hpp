#pragma once

#include "token.hpp"
#include <string>
#include <vector>
#include <cctype>
#include <cstdlib>
#include <stdexcept>
#include <cmath>
#include <utility>

namespace lluna::core {

class Lexer {
public:
    explicit Lexer(std::string input) : input_(std::move(input)), pos_(0) {}

    std::vector<Token> tokenize() {
        std::vector<Token> tokens;
        while (pos_ < input_.size()) {
            skip_whitespace();
            if (pos_ >= input_.size()) break;

            char ch = input_[pos_];

            // Numbers: either starts with digit or with '.' followed by digit
            if (std::isdigit(static_cast<unsigned char>(ch)) ||
                (ch == '.' && pos_ + 1 < input_.size() && std::isdigit(static_cast<unsigned char>(input_[pos_ + 1])))) {
                tokens.push_back(read_number());
                continue;
            }

            // UTF-8 π character (0xCF 0x80) and ϕ / φ characters (0xCF 0x95 / 0xCF 0x86)
            if (static_cast<unsigned char>(ch) == 0xCF && pos_ + 1 < input_.size()) {
                unsigned char next_ch = static_cast<unsigned char>(input_[pos_ + 1]);
                if (next_ch == 0x80) {
                    tokens.push_back(Token::make(TokenType::Identifier, "π", pos_));
                    pos_ += 2;
                    continue;
                }
                if (next_ch == 0x95 || next_ch == 0x86) {
                    tokens.push_back(Token::make(TokenType::Identifier, "ϕ", pos_));
                    pos_ += 2;
                    continue;
                }
            }

            if (static_cast<unsigned char>(ch) == 0xE2 && pos_ + 2 < input_.size() &&
                static_cast<unsigned char>(input_[pos_ + 1]) == 0x88 &&
                static_cast<unsigned char>(input_[pos_ + 2]) == 0x9E) {
                tokens.push_back(Token::make(TokenType::Infinity, "infinity", pos_));
                pos_ += 3;
                continue;
            }

            if (static_cast<unsigned char>(ch) == 0xC2 && pos_ + 1 < input_.size() &&
                static_cast<unsigned char>(input_[pos_ + 1]) == 0xB0) {
                tokens.push_back(Token::make(TokenType::Degree, "°", pos_));
                pos_ += 2;
                continue;
            }

            // Identifiers / words: [a-zA-Z_][a-zA-Z0-9_]*
            if (std::isalpha(static_cast<unsigned char>(ch)) || ch == '_') {
                tokens.push_back(read_identifier());
                continue;
            }

            // Operators and punctuation
            std::size_t start = pos_;
            switch (ch) {
                case '+':
                    tokens.push_back(Token::make(TokenType::Plus, "+", start));
                    pos_++;
                    break;
                case '-':
                    tokens.push_back(Token::make(TokenType::Minus, "-", start));
                    pos_++;
                    break;
                case '*':
                    tokens.push_back(Token::make(TokenType::Star, "*", start));
                    pos_++;
                    break;
                case '/':
                    tokens.push_back(Token::make(TokenType::Slash, "/", start));
                    pos_++;
                    break;
                case '^':
                    tokens.push_back(Token::make(TokenType::Caret, "^", start));
                    pos_++;
                    break;
                case '!':
                    tokens.push_back(Token::make(TokenType::Exclamation, "!", start));
                    pos_++;
                    break;
                case '(':
                    tokens.push_back(Token::make(TokenType::LParen, "(", start));
                    pos_++;
                    break;
                case ')':
                    tokens.push_back(Token::make(TokenType::RParen, ")", start));
                    pos_++;
                    break;
                case '|':
                    tokens.push_back(Token::make(TokenType::Pipe, "|", start));
                    pos_++;
                    break;
                case ',':
                    tokens.push_back(Token::make(TokenType::Comma, ",", start));
                    pos_++;
                    break;
                default:
                    throw std::runtime_error("Unexpected character in expression");
            }
        }

        tokens.push_back(Token::make(TokenType::Eof, "", pos_));
        return tokens;
    }

private:
    void skip_whitespace() {
        while (pos_ < input_.size() && std::isspace(static_cast<unsigned char>(input_[pos_]))) {
            pos_++;
        }
    }

    bool digit_at(std::size_t index) const {
        return index < input_.size() && std::isdigit(static_cast<unsigned char>(input_[index]));
    }

    // Decimal literal: digits [. digits] [e[+-]digits]. The exponent is only
    // consumed when digits follow, so "2e" stays 2 * e.
    Token read_number() {
        const std::size_t start = pos_;
        while (digit_at(pos_)) pos_++;
        if (pos_ < input_.size() && input_[pos_] == '.') {
            pos_++;
            while (digit_at(pos_)) pos_++;
        }
        if (pos_ < input_.size() && (input_[pos_] == 'e' || input_[pos_] == 'E')) {
            std::size_t exponent = pos_ + 1;
            if (exponent < input_.size() && (input_[exponent] == '+' || input_[exponent] == '-')) exponent++;
            if (digit_at(exponent)) {
                pos_ = exponent;
                while (digit_at(pos_)) pos_++;
            }
        }
        std::string text = input_.substr(start, pos_ - start);
        const double value = std::strtod(text.c_str(), nullptr);
        if (!std::isfinite(value)) {
            throw std::runtime_error("The number is not finite");
        }
        return Token::make_number(value, std::move(text), start);
    }

    Token read_identifier() {
        std::size_t start = pos_;
        while (pos_ < input_.size() &&
               (std::isalnum(static_cast<unsigned char>(input_[pos_])) || input_[pos_] == '_')) {
            pos_++;
        }
        std::string id = input_.substr(start, pos_ - start);
        return Token::make(TokenType::Identifier, id, start);
    }

    std::string input_;
    std::size_t pos_;
};

} // namespace lluna::core
