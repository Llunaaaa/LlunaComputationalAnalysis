use serde::Serialize;

#[repr(C)]
struct NativeMathResult {
    error_code: i32,
    is_approximate: i32,
    value: f64,
    error_message: [u8; 256],
    exact_value: [u8; 256],
}

unsafe extern "C" {
    fn evaluate_expression(expression: *const std::ffi::c_char) -> NativeMathResult;
}

#[derive(Debug, Serialize)]
struct Evaluation {
    value: Option<f64>,
    exact: Option<String>,
    is_approximate: bool,
    error: Option<String>,
}

#[tauri::command]
fn evaluate(expression: String) -> Result<Evaluation, String> {
    let expression = std::ffi::CString::new(expression)
        .map_err(|_| "Expression contains an invalid character".to_owned())?;

    let result = unsafe { evaluate_expression(expression.as_ptr()) };
    if result.error_code == 0 {
        return Ok(Evaluation {
            value: Some(result.value),
            exact: read_message(&result.exact_value),
            is_approximate: result.is_approximate != 0,
            error: None,
        });
    }

    let message_length = result
        .error_message
        .iter()
        .position(|character| *character == 0)
        .unwrap_or(result.error_message.len());
    let message = String::from_utf8_lossy(&result.error_message[..message_length]).into_owned();
    Ok(Evaluation {
        value: None,
        exact: None,
        is_approximate: false,
        error: Some(message),
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
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![evaluate])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::evaluate;

    #[test]
    fn evaluates_arithmetic_through_native_engine() {
        let result = evaluate("2 * (3 + 4)".to_owned()).expect("evaluation should succeed");
        assert_eq!(result.value, Some(14.0));
        assert_eq!(result.is_approximate, false);
        assert_eq!(result.error, None);
    }

    #[test]
    fn evaluates_irrational_as_approximation() {
        let result = evaluate("sqrt(2)".to_owned()).expect("evaluation should succeed");
        assert!(result.value.is_some());
        assert_eq!(result.is_approximate, true);
        assert_eq!(result.error, None);
    }

    #[test]
    fn reports_native_engine_errors() {
        let result = evaluate("1 / 0".to_owned()).expect("command should return an evaluation");
        assert_eq!(result.value, None);
        assert_eq!(result.error.as_deref(), Some("Cannot divide by zero"));
    }
}
