use serde::Serialize;

#[repr(C)]
struct NativeMathResult {
    error_code: i32,
    is_approximate: i32,
    value: f64,
    error_message: [u8; 256],
    exact_value: [u8; 256],
    display_value: [u8; 256],
}

unsafe extern "C" {
    fn evaluate_expression(expression: *const std::ffi::c_char) -> NativeMathResult;
}

#[derive(Debug, Serialize)]
struct Evaluation {
    value: Option<f64>,
    exact: Option<String>,
    display_value: Option<String>,
    is_approximate: bool,
    error: Option<String>,
}

// Evaluations can take a while (million-term sums, adaptive integrals), so the
// command runs them on the blocking pool instead of the UI thread.
#[tauri::command]
async fn evaluate(expression: String) -> Result<Evaluation, String> {
    tauri::async_runtime::spawn_blocking(move || evaluate_native(expression))
        .await
        .map_err(|error| error.to_string())?
}

fn evaluate_native(expression: String) -> Result<Evaluation, String> {
    let expression = std::ffi::CString::new(expression)
        .map_err(|_| "Expression contains an invalid character".to_owned())?;

    let result = unsafe { evaluate_expression(expression.as_ptr()) };
    if result.error_code == 0 {
        return Ok(Evaluation {
            value: if result.value.is_finite() { Some(result.value) } else { None },
            exact: read_message(&result.exact_value),
            display_value: read_message(&result.display_value),
            is_approximate: result.is_approximate != 0,
            error: None,
        });
    }

    Ok(Evaluation {
        value: None,
        exact: None,
        display_value: None,
        is_approximate: false,
        error: Some(read_message(&result.error_message).unwrap_or_else(|| "Unknown error".to_owned())),
    })
}

fn read_message(message: &[u8]) -> Option<String> {
    let length = message
        .iter()
        .position(|character| *character == 0)
        .unwrap_or(message.len());
    if length == 0 {
        None
    } else {
        Some(String::from_utf8_lossy(&message[..length]).into_owned())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![evaluate])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::evaluate_native as evaluate;

    #[test]
    fn evaluates_arithmetic_through_native_engine() {
        let result = evaluate("2 * (3 + 4)".to_owned()).expect("evaluation should succeed");
        assert_eq!(result.value, Some(14.0));
        assert_eq!(result.is_approximate, false);
        assert_eq!(result.error, None);

        let dec = evaluate("0.5 + 0.5".to_owned()).expect("evaluation should succeed");
        assert_eq!(dec.value, Some(1.0));
        assert_eq!(dec.is_approximate, false);
    }

    #[test]
    fn evaluates_large_factorial_beyond_170() {
        let result = evaluate("171!".to_owned()).expect("evaluation should succeed");
        assert!(result.display_value.is_some());
        assert!(result.display_value.unwrap().starts_with("1.241018"));
        assert_eq!(result.error, None);
    }

    #[test]
    fn evaluates_stirling_factorial_beyond_100000() {
        let result = evaluate("100001!".to_owned()).expect("evaluation should succeed");
        assert!(result.display_value.is_some());
        assert!(result.display_value.unwrap().starts_with("2.82425"));
        assert_eq!(result.is_approximate, true);
        assert_eq!(result.error, None);
    }

    #[test]
    fn evaluates_symbolic_cancellations() {
        let r1 = evaluate("pi / pi".to_owned()).expect("evaluation should succeed");
        assert_eq!(r1.value, Some(1.0));
        assert_eq!(r1.is_approximate, false);

        let r2 = evaluate("sqrt(2) / sqrt(2)".to_owned()).expect("evaluation should succeed");
        assert_eq!(r2.value, Some(1.0));
        assert_eq!(r2.is_approximate, false);

        let r3 = evaluate("sqrt(2) * sqrt(2)".to_owned()).expect("evaluation should succeed");
        assert_eq!(r3.value, Some(2.0));
        assert_eq!(r3.is_approximate, false);

        let r4 = evaluate("(sqrt(2))^4".to_owned()).expect("evaluation should succeed");
        assert_eq!(r4.value, Some(4.0));
        assert_eq!(r4.is_approximate, false);

        let r5 = evaluate("(1 / pi) * pi".to_owned()).expect("evaluation should succeed");
        assert_eq!(r5.value, Some(1.0));
        assert_eq!(r5.is_approximate, false);

        let r6 = evaluate("log(2)(1/8)".to_owned()).expect("evaluation should succeed");
        assert_eq!(r6.value, Some(-3.0));
        assert_eq!(r6.is_approximate, false);
    }

    #[test]
    fn evaluates_gamma_factorials() {
        let r1 = evaluate("9.5!".to_owned()).expect("evaluation should succeed");
        assert!(r1.display_value.unwrap().starts_with("1133278"));
        assert_eq!(r1.is_approximate, true);

        let r2 = evaluate("(-0.5)!".to_owned()).expect("evaluation should succeed");
        assert!(r2.display_value.unwrap().starts_with("1.77245"));
        assert_eq!(r2.is_approximate, true);

        let r3 = evaluate("(-9)!".to_owned()).expect("evaluation should succeed");
        assert_eq!(r3.error.as_deref(), Some("Factorial is undefined for negative integers"));
    }

    #[test]
    fn guards_against_unreasonable_computation() {
        let result = evaluate("9^(100000!)".to_owned()).expect("command should return an evaluation");
        assert_eq!(result.value, None);
        assert_eq!(result.error.as_deref(), Some("Operation requires an unreasonable amount of computational power"));
    }

    #[test]
    fn evaluates_calculus_operations() {
        let r1 = evaluate("integral(1, 3, x, x^2)".to_owned()).expect("evaluation should succeed");
        assert!((r1.value.unwrap() - 26.0 / 3.0).abs() < 1e-9);
        assert_eq!(r1.exact.as_deref(), Some("26/3"));

        let r2 = evaluate("3 * integral(0, 2, x, x^2)".to_owned()).expect("evaluation should succeed");
        assert_eq!(r2.value, Some(8.0));

        let r3 = evaluate("derivative(x, 3, x^2)".to_owned()).expect("evaluation should succeed");
        assert_eq!(r3.value, Some(6.0));

        let r4 = evaluate("derivative_n(2, x, 3, x^3)".to_owned()).expect("evaluation should succeed");
        assert_eq!(r4.value, Some(18.0));

        let r5 = evaluate("limit(x, 0, x^2)".to_owned()).expect("evaluation should succeed");
        assert_eq!(r5.value, Some(0.0));

        let r6 = evaluate("limit(x, infinity, 1/x)".to_owned()).expect("evaluation should succeed");
        assert_eq!(r6.value, Some(0.0));

        let r7 = evaluate("int".to_owned()).expect("command should return an evaluation");
        assert_eq!(r7.value, None);
        assert_eq!(
            r7.error.as_deref(),
            Some("Integral requires arguments in parentheses: integral(lower, upper, variable, integrand)")
        );
    }

    #[test]
    fn evaluates_trigonometric_operations() {
        let sin = evaluate("sin(pi / 6)".to_owned()).expect("evaluation should succeed");
        assert_eq!(sin.value, Some(0.5));
        assert_eq!(sin.exact.as_deref(), Some("1/2"));

        let cos = evaluate("cos(pi / 3)".to_owned()).expect("evaluation should succeed");
        assert_eq!(cos.value, Some(0.5));

        let tan = evaluate("tan(pi / 4)".to_owned()).expect("evaluation should succeed");
        assert_eq!(tan.value, Some(1.0));

        let pole = evaluate("tan(pi / 2)".to_owned()).expect("command should return an evaluation");
        assert_eq!(pole.error.as_deref(), Some("Tangent is undefined at odd multiples of pi/2"));

        let degree = evaluate("sin(30°)".to_owned()).expect("evaluation should succeed");
        assert_eq!(degree.value, Some(0.5));
        assert_eq!(degree.exact.as_deref(), Some("1/2"));
        assert_eq!(degree.is_approximate, false);

        let inverse = evaluate("asin(1/2)".to_owned()).expect("evaluation should succeed");
        assert_eq!(inverse.exact.as_deref(), Some("π/6"));
    }

    #[test]
    fn falls_back_to_scientific_on_rational_overflow() {
        let power = evaluate("2^64".to_owned()).expect("evaluation should succeed");
        assert_eq!(power.value, Some(18446744073709551616.0));
        assert_eq!(power.is_approximate, true);

        let exact = evaluate("2^62".to_owned()).expect("evaluation should succeed");
        assert_eq!(exact.is_approximate, false);
    }

    #[test]
    fn scopes_bound_variables_over_constants() {
        let sum = evaluate("sum(e, 1, 3, e)".to_owned()).expect("evaluation should succeed");
        assert_eq!(sum.value, Some(6.0));
    }

    #[test]
    fn reports_native_engine_errors() {
        let result = evaluate("1 / 0".to_owned()).expect("command should return an evaluation");
        assert_eq!(result.value, None);
        assert_eq!(result.error.as_deref(), Some("Cannot divide by zero"));
    }
}
