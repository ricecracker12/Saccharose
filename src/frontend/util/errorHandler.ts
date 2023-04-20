import { escapeHtml } from '../../shared/util/stringUtil';
import { modalService } from './modalService';
import { copyToClipboard } from './domutil';

let handlingJavascriptError = false;

export function showJavascriptErrorDialog(message, source, lineno?: number, colno?: number, error?: any) {
  console.error('Javascript Error:', error || message);

  if (handlingJavascriptError) {
    return;
  }

  handlingJavascriptError = true;

  modalService.modal('Unexpected Error', `
    <p>
      An unexpected JavaScript error occurred. Try again in a few moments. If the problem
      persists then yell at kwwxis.
    </p>
  `, {
    onConfirm() {
      handlingJavascriptError = false;
    }
  });

  return true;
}

let handlingInternalError = false;

export function showInternalErrorDialog(data) {
  console.error('Internal Error:', data);

  if (handlingInternalError) {
    return;
  }

  handlingInternalError = true;

  modalService.modal('Internal Error', `
    <p>
      An internal server error occurred. Try again in a few moments. If the problem
      persists then yell at kwwxis.
    </p>
    <div class='buttons spacer15-top'>
      <button class='primary dismiss-btn'>Dismiss</button>
    </div>
  `, {
    onConfirm() {
      handlingInternalError = false;
    }
  });

  return true;
}