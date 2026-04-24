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
            .mqb-dialog-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(8, 11, 18, 0.58);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                padding: 24px;
            }
            .mqb-dialog {
                width: min(460px, 100%);
                background: var(--surface-0, #141922);
                color: var(--text-primary, #f4f7fb);
                border: 1px solid var(--border-default, rgba(255,255,255,0.12));
                border-radius: 16px;
                box-shadow: 0 30px 70px rgba(0,0,0,0.35);
                overflow: hidden;
            }
            .mqb-dialog__header {
                padding: 18px 20px 8px;
                font-size: 1rem;
                font-weight: 700;
            }
            .mqb-dialog__body {
                padding: 0 20px 18px;
                color: var(--text-dim, rgba(255,255,255,0.75));
                line-height: 1.5;
            }
            .mqb-dialog__input {
                width: 100%;
                margin-top: 14px;
                box-sizing: border-box;
                padding: 10px 12px;
                border-radius: 10px;
                border: 1px solid var(--border-default, rgba(255,255,255,0.14));
                background: var(--surface-1, rgba(255,255,255,0.04));
                color: inherit;
                font: inherit;
            }
            .mqb-dialog__select {
                width: 100%;
                margin-top: 14px;
                box-sizing: border-box;
                padding: 10px 12px;
                border-radius: 10px;
                border: 1px solid var(--border-default, rgba(255,255,255,0.14));
                background: var(--surface-1, rgba(255,255,255,0.04));
                color: inherit;
                font: inherit;
                height: 40px;
            }
            .mqb-dialog__actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 0 20px 20px;
            }
            .mqb-dialog__button {
                border: 0;
                border-radius: 10px;
                padding: 10px 14px;
                font: inherit;
                cursor: pointer;
            }
            .mqb-dialog__button--neutral {
                background: rgba(255,255,255,0.08);
                color: white;
            }
            .mqb-dialog__button--brand {
                background: #1d73ff;
                color: white;
            }
        `;
        document.head.appendChild(style);
    };

    const escapeHtml = (value) =>
        String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    const openDialog = ({ title, message, confirmLabel = 'OK', cancelLabel = '', value = '', placeholder = '', choices = null }) =>
        new Promise((resolve) => {
            ensureStyles();

            const backdrop = document.createElement('div');
            backdrop.className = 'mqb-dialog-backdrop';

            const hasInput = placeholder !== null;
            const hasChoices = Array.isArray(choices) && choices.length > 0;
            const dialog = document.createElement('div');
            dialog.className = 'mqb-dialog';
            dialog.replaceChildren(
                h('div', { className: 'mqb-dialog__header' }, title),
                h(
                    'div',
                    { className: 'mqb-dialog__body' },
                    h('div', {}, message),
                    hasChoices
                        ? h(
                            'select',
                            { className: 'mqb-dialog__select' },
                            ...choices.map((choice) =>
                                h('option', { value: String(choice.value) }, String(choice.label)),
                            ),
                        )
                        : '',
                    hasInput
                        ? h('input', { className: 'mqb-dialog__input', type: 'text' })
                        : '',
                ),
                h(
                    'div',
                    { className: 'mqb-dialog__actions' },
                    cancelLabel
                        ? h(
                            'button',
                            {
                                className: 'mqb-dialog__button mqb-dialog__button--neutral',
                                'data-role': 'cancel',
                            },
                            cancelLabel,
                        )
                        : '',
                    h(
                        'button',
                        {
                            className: 'mqb-dialog__button mqb-dialog__button--brand',
                            'data-role': 'confirm',
                        },
                        confirmLabel,
                    ),
                ),
            );

            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            const input = dialog.querySelector('.mqb-dialog__input');
            const select = dialog.querySelector('.mqb-dialog__select');
            if (input) {
                input.value = value;
                input.placeholder = placeholder;
                requestAnimationFrame(() => {
                    input.focus();
                    input.select();
                });
            } else if (select) {
                requestAnimationFrame(() => {
                    select.focus();
                });
            }

            const cleanup = (result) => {
                backdrop.remove();
                resolve(result);
            };

            dialog.querySelector('[data-role="confirm"]').onclick = () => {
                if (input) {
                    cleanup(input.value.trim());
                    return;
                }
                if (select) {
                    cleanup(select.value);
                    return;
                }
                cleanup(true);
            };

            const cancel = dialog.querySelector('[data-role="cancel"]');
            if (cancel) {
                cancel.onclick = () => cleanup(input ? null : false);
            }

            backdrop.onclick = (event) => {
                if (event.target === backdrop) {
                    cleanup(input || select ? null : false);
                }
            };

            backdrop.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    cleanup(input || select ? null : false);
                }
                if (event.key === 'Enter' && input) {
                    cleanup(input.value.trim());
                }
            });
        });

    window.mqbAlert = async (message, title = 'Notice') => {
        await openDialog({ title, message, confirmLabel: 'OK', cancelLabel: '', placeholder: null });
    };

    window.mqbConfirm = async (message, title = 'Confirm') =>
        openDialog({ title, message, confirmLabel: 'Continue', cancelLabel: 'Cancel', placeholder: null });

    window.mqbPrompt = async (message, title = 'Enter Name', options = {}) =>
        openDialog({
            title,
            message,
            confirmLabel: options.confirmLabel || 'Create',
            cancelLabel: options.cancelLabel || 'Cancel',
            value: options.value || '',
            placeholder: options.placeholder || '',
        });

    window.mqbChoose = async (message, title = 'Choose', options = {}) =>
        openDialog({
            title,
            message,
            confirmLabel: options.confirmLabel || 'Select',
            cancelLabel: options.cancelLabel || 'Cancel',
            placeholder: null,
            choices: options.choices || [],
        });
})();
