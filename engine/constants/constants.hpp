#pragma once

#include <cmath>
#include <string>
#include <vector>
#include <functional>

namespace lluna::constants {

struct ConstantDefinition {
    std::string name;
    std::string symbol;
    std::function<double()> compute;
    bool is_irrational;
};

inline double compute_pi() {
    return 4.0 * std::atan(1.0);
}

inline double compute_euler() {
    // e = sum_{k=0}^{25} 1 / k!
    // 25 iterations guarantees convergence to machine precision in double (53-bit mantissa)
    double sum = 0.0;
    double term = 1.0;
    for (int k = 1; k <= 25; ++k) {
        sum += term;
        term /= static_cast<double>(k);
    }
    return sum;
}

inline double compute_phi() {
    return (1.0 + std::sqrt(5.0)) / 2.0;
}

inline const std::vector<ConstantDefinition>& get_all_constants() {
    static const std::vector<ConstantDefinition> registry = {
        {"pi", "π", compute_pi, true},
        {"π", "π", compute_pi, true},
        {"e", "e", compute_euler, true},
        {"phi", "ϕ", compute_phi, true},
        {"ϕ", "ϕ", compute_phi, true},
        {"φ", "φ", compute_phi, true}
    };
    return registry;
}

inline const ConstantDefinition* find_constant(const std::string& name) {
    for (const auto& c : get_all_constants()) {
        if (c.name == name) {
            return &c;
        }
    }
    return nullptr;
}

inline bool is_constant_name(const std::string& name) {
    return find_constant(name) != nullptr;
}

} // namespace lluna::constants
