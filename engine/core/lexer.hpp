#pragma once

#include "token.hpp"
#include <string>
#include <vector>
#include <cctype>
#include <cstdlib>
#include <stdexcept>
#include <cmath>

namespace lluna::core {

class Lexer {
public:
    explicit Lexer(const std::string& input) : input_(input), pos_(0) {}

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

    Token read_number() {
        std::size_t start = pos_;
        char* end = nullptr;
        const char* str_start = input_.c_str() + pos_;
        double val = std::strtod(str_start, &end);
        if (end == str_start) {
            throw std::runtime_error("Expected a number");
        }
        if (!std::isfinite(val)) {
            throw std::runtime_error("The number is not finite");
        }
        std::size_t length = static_cast<std::size_t>(end - str_start);
        std::string num_str = input_.substr(start, length);
        pos_ += length;
        return Token::make_number(val, num_str, start);
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

    const std::string& input_;
    std::size_t pos_;
};

} // namespace lluna::core
