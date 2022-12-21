import { Listener, startListeners } from '../../util/eventLoader';
import Cookies from 'js-cookie';
import { flashTippy } from '../../util/tooltips';
import { endpoints } from '../../endpoints';
import { pageMatch } from '../../pageMatch';

pageMatch('pages/basic/olgen', () => {
  function loadResultFromURL() {
    const url = new URL(window.location.href);
    const query = url.searchParams.get('q');
    window.history.replaceState({q: query}, null, window.location.href);
    if (query) {
      document.querySelector<HTMLInputElement>('.ol-input').value = query;
      generateResult(true);
    } else {
      document.querySelector<HTMLInputElement>('.ol-input').value = '';
    }
  }

  function loadResultFromState(state) {
    if (!state)
      state = {};
    document.querySelector<HTMLInputElement>('.ol-input').value = state.q || '';
    if (state.q) {
      generateResult(true);
    } else {
      document.querySelector('#ol-results-list').innerHTML = '';
    }
  }

  function generateResult(isNonUserAction: boolean = false) {
    let inputEl = document.querySelector<HTMLInputElement>('.ol-input');
    let buttonEl  = document.querySelector<HTMLButtonElement>('.ol-submit');
    let loadingEl = document.querySelector<HTMLElement>('.ol-submit-pending');
    let tlOptionValue = document.querySelector<HTMLInputElement>('input[type="radio"][name="tl_options"]:checked').value;
    let rmOptionValue = document.querySelector<HTMLInputElement>('input[type="radio"][name="rm_options"]:checked').value;
    let text = inputEl.value.trim();

    if (!text) {
      flashTippy(inputEl, {content: 'Enter a name first!', delay:[0,2000]});
      return;
    }

    loadingEl.classList.remove('hide');
    inputEl.disabled = true;
    buttonEl.disabled = true;

    const url = new URL(window.location.href);
    url.searchParams.set('q', text);
    if (isNonUserAction) {
      window.history.replaceState({q: text}, null, url.href);
    } else {
      window.history.pushState({q: text}, null, url.href);
    }

    endpoints.generateOL(text, tlOptionValue === 'exclude_tl', tlOptionValue === 'exclude_tl', rmOptionValue === 'exclude_rm', true).then(result => {
      if (typeof result === 'string') {
        document.querySelector('#ol-results-list').innerHTML = result;
        if (!result.includes('no-results-found')) {
          inputEl.value = '';
        }
      } else if (typeof result === 'object' && result.error_description) {
        if (result.error_code === 'NOT_FOUND') {
          document.querySelector('#ol-results-list').innerHTML = endpoints.errorHtmlWrap('Not Found: ' + result.error_description);
        } else {
          document.querySelector('#ol-results-list').innerHTML = endpoints.errorHtmlWrap(result.error_description);
        }
      }
    }).finally(() => {
      loadingEl.classList.add('hide');
      inputEl.disabled = false;
      buttonEl.disabled = false;
    });
  }

  const listeners: Listener[] = [
    {
      ev: 'ready',
      fn: function() {
        loadResultFromURL();
      }
    },
    {
      el: 'window',
      ev: 'popstate', // user clicks browser back/forward buttons
      fn: function(event: PopStateEvent) {
        if (!event.state) {
          return;
        }
        console.log('[popstate] URL changed to', window.location.href, ' / state:', event.state);
        loadResultFromState(event.state);
      }
    },
    {
      el: '.ol-input',
      ev: 'enter',
      fn: function(event, target) {
        generateResult();
      }
    },
    {
      el: 'input[type="radio"][name="tl_options"],input[type="radio"][name="rm_options"]',
      ev: 'input',
      multiple: true,
      fn: function(event, target: HTMLInputElement) {
        let name = target.name;
        let value = target.value;
        Cookies.set('OL.'+name, value, { expires: 365 });
      }
    },
    {
      el: '.ol-submit',
      ev: 'click',
      fn: function(event, target) {
        generateResult();
      }
    },
  ];

  startListeners(listeners);
});