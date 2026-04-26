(function () {
    const h = (...args) => {
        const hyperscript = window.VanillaSchemaForms?.h;
        if (typeof hyperscript === 'function') {
            return hyperscript(...args);
        }

        const [tagName, attrs = {}, ...children] = args;
        const element = document.createElement(tagName);
        Object.entries(attrs || {}).forEach(([key, value]) => {
            if (value === null || value === undefined || value === false) return;
            if (key === 'className') {
                element.className = value;
                return;
            }
            if (key === 'style' && typeof value === 'object') {
                Object.assign(element.style, value);
                return;
            }
            element.setAttribute(key, String(value));
        });

        children.flat().forEach((child) => {
            if (child === null || child === undefined || child === false || child === '') return;
            if (child instanceof Node) {
                element.appendChild(child);
            } else {
                element.appendChild(document.createTextNode(String(child)));
            }
        });

        return element;
    };

    const ensureStyles = () => {
        if (document.getElementById('mqb-dialog-styles')) return;

        const style = document.createElement('style');
        style.id = 'mqb-dialog-styles';
        style.textContent = `
            wa-dialog.mqb-dialog::part(panel) {
                min-width: min(520px, calc(100vw - 32px));
            }
            .mqb-dialog-body {
                display: grid;
                gap: 14px;
                color: var(--text-muted);
                line-height: 1.5;
            }
            .mqb-dialog-input {
                width: 100%;
                box-sizing: border-box;
                padding: 10px 12px;
                border-radius: 10px;
                border: 1px solid var(--border);
                background: var(--bg-input);
                color: var(--text-primary);
                font: inherit;
            }
            .mqb-choice-list {
                display: grid;
                gap: 8px;
                margin-top: 2px;
            }
            .mqb-choice-link {
                background: transparent;
                border: 0;
                padding: 10px 0;
                text-align: left;
                cursor: pointer;
                color: var(--accent-blue);
                border-bottom: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
                font: inherit;
            }
            .mqb-choice-link:last-child {
                border-bottom: 0;
            }
            .mqb-choice-link:hover {
                color: color-mix(in srgb, var(--accent-blue) 72%, white);
            }
            .mqb-choice-link__title {
                display: block;
                font-weight: 600;
                color: inherit;
            }
            .mqb-choice-link__description {
                display: block;
                margin-top: 3px;
                font-size: 11px;
                color: var(--text-dim);
            }
        `;
        document.head.appendChild(style);
    };

    const openDialog = ({
        title,
        message,
        confirmLabel = 'OK',
        cancelLabel = '',
        value = '',
        placeholder = '',
        mode = 'message',
        choices = [],
    }) =>
        new Promise((resolve) => {
            ensureStyles();

            const dialog = document.createElement('wa-dialog');
            dialog.className = 'mqb-dialog';
            dialog.setAttribute('label', title);
            dialog.lightDismiss = true;

            const body = h('div', { className: 'mqb-dialog-body' }, h('div', {}, message));
            let input = null;
            let resolved = false;
            let result = mode === 'confirm' ? false : null;

            if (mode === 'prompt') {
                input = h('input', { className: 'mqb-dialog-input', type: 'text' });
                input.value = value;
                input.placeholder = placeholder;
                body.appendChild(input);
            }

            if (mode === 'choose') {
                const choiceList = h('div', { className: 'mqb-choice-list' });
                choices.forEach((choice) => {
                    const button = h(
                        'button',
                        { className: 'mqb-choice-link', type: 'button' },
                        h('span', { className: 'mqb-choice-link__title' }, String(choice.label)),
                        choice.description
                            ? h('span', { className: 'mqb-choice-link__description' }, String(choice.description))
                            : '',
                    );
                    button.onclick = () => {
                        result = choice.value;
                        dialog.open = false;
                    };
                    choiceList.appendChild(button);
                });
                body.appendChild(choiceList);
            }

            dialog.appendChild(body);

            if (mode !== 'choose') {
                if (cancelLabel) {
                    const cancelButton = document.createElement('wa-button');
                    cancelButton.slot = 'footer';
                    cancelButton.variant = 'neutral';
                    cancelButton.appearance = 'outlined';
                    cancelButton.size = 'small';
                    cancelButton.textContent = cancelLabel;
                    cancelButton.onclick = () => {
                        result = mode === 'confirm' ? false : null;
                        dialog.open = false;
                    };
                    dialog.appendChild(cancelButton);
                }

                const confirmButton = document.createElement('wa-button');
                confirmButton.slot = 'footer';
                confirmButton.variant = 'brand';
                confirmButton.size = 'small';
                confirmButton.textContent = confirmLabel;
                confirmButton.onclick = () => {
                    if (mode === 'prompt') {
                        result = input?.value.trim() || '';
                    } else {
                        result = true;
                    }
                    dialog.open = false;
                };
                dialog.appendChild(confirmButton);
            } else if (cancelLabel) {
                const cancelButton = document.createElement('wa-button');
                cancelButton.slot = 'footer';
                cancelButton.variant = 'neutral';
                cancelButton.appearance = 'outlined';
                cancelButton.size = 'small';
                cancelButton.textContent = cancelLabel;
                cancelButton.onclick = () => {
                    result = null;
                    dialog.open = false;
                };
                dialog.appendChild(cancelButton);
            }

            const cleanup = () => {
                if (resolved) return;
                resolved = true;
                dialog.remove();
                resolve(result);
            };

            dialog.addEventListener('wa-after-hide', cleanup, { once: true });
            document.body.appendChild(dialog);
            requestAnimationFrame(() => {
                dialog.open = true;
                if (input) {
                    input.focus();
                    input.select();
                    input.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter') {
                            result = input.value.trim();
                            dialog.open = false;
                        }
                    });
                }
            });
        });

    window.mqbAlert = async (message, title = 'Notice') => {
        await openDialog({
            title,
            message,
            confirmLabel: 'OK',
            mode: 'message',
        });
    };

    window.mqbConfirm = async (message, title = 'Confirm') =>
        openDialog({
            title,
            message,
            confirmLabel: 'Continue',
            cancelLabel: 'Cancel',
            mode: 'confirm',
        });

    window.mqbPrompt = async (message, title = 'Enter Name', options = {}) =>
        openDialog({
            title,
            message,
            confirmLabel: options.confirmLabel || 'Create',
            cancelLabel: options.cancelLabel || 'Cancel',
            value: options.value || '',
            placeholder: options.placeholder || '',
            mode: 'prompt',
        });

    window.mqbChoose = async (message, title = 'Choose', options = {}) =>
        openDialog({
            title,
            message,
            cancelLabel: options.cancelLabel || 'Cancel',
            mode: 'choose',
            choices: options.choices || [],
        });
})();
