import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const sourceDirectory = process.env.NOW_SOURCE;
const source = filename => readFileSync(
    sourceDirectory
        ? `${sourceDirectory.replace(/\/$/, '')}/${filename}`
        : new URL(`../Now/js/${filename}`, import.meta.url),
    'utf8'
);

function setup() {
    const managers = new Map();
    const notifications = [];
    const window = {
        Now: {
            registerManager(name, manager) {
                managers.set(name, manager);
            }
        },
        NotificationManager: {
            error(message) {
                notifications.push(message);
            }
        }
    };
    const FormError = {
        resolveFieldElement(name, form) {
            return form?.fields?.[name] || null;
        },
        getFieldLabel(field) {
            return field?.label || field?.name || field?.id || '';
        },
        hasInlineErrorContainer(name, form) {
            return Boolean(form?.inline?.[name]);
        },
        showFieldError(name, message, form) {
            const field = this.resolveFieldElement(name, form);
            if (field) {
                field.error = message;
            }
            return [message];
        },
        clearFieldError(field) {
            field.error = null;
        }
    };
    window.FormError = FormError;

    const sandbox = {
        document: {},
        window,
        Now: window.Now,
        FormError,
        NotificationManager: window.NotificationManager
    };

    vm.runInNewContext(source('ResponseHandler.js'), sandbox);
    const responseHandler = [...managers.values()].find(manager => manager.handleFormErrors);
    window.ResponseHandler = responseHandler;
    responseHandler.init();

    vm.runInNewContext(source('EventSystemManager.js'), sandbox);
    const eventSystemManager = [...managers.values()].find(manager => manager.handleRequestApiFailure);
    vm.runInNewContext(source('FormManager.js'), sandbox);
    const formManager = managers.get('form');

    return {eventSystemManager, formManager, notifications};
}

test('requestApi highlights fields and includes every error in one toast', () => {
    const {eventSystemManager, notifications} = setup();
    const field = {label: 'Decision note', focus() {this.focused = true;} };
    const form = {fields: {approval_reason: field}, inline: {approval_reason: true}};

    eventSystemManager.handleRequestApiFailure({
        status: 400,
        data: {
            success: false,
            message: 'Validation failed',
            errors: {approval_reason: 'Please fill in', unknown_field: 'Unknown field'}
        }
    }, {form}, 'Validation failed');

    assert.equal(field.error, 'Please fill in');
    assert.equal(field.focused, true);
    assert.deepEqual(notifications, ['Decision note: Please fill in\nUnknown field']);
});

test('requestApi field errors survive validation until the field is edited', async () => {
    const {eventSystemManager, formManager, notifications} = setup();
    const listeners = new Map();
    const field = {
        name: 'approval_reason',
        label: 'Decision note',
        value: '',
        type: 'textarea',
        classList: {contains: () => true},
        focus() {},
        select() {}
    };
    const form = {
        fields: {approval_reason: field},
        inline: {approval_reason: true},
        addEventListener(type, handler) {
            listeners.set(type, handler);
        }
    };
    const instance = {
        element: form,
        state: {apiFieldErrors: {}, errors: {}},
        config: {dirtyClass: 'modified', validateOnlyDirty: true, validateOnInput: false, validateOnBlur: false}
    };
    formManager.setupFormEvents(instance);

    eventSystemManager.handleRequestApiFailure({
        data: {success: false, message: 'Validation failed', errors: {approval_reason: 'Please fill in'}}
    }, {form, instance}, 'Validation failed');

    assert.equal(await formManager.validateField(instance, field), false);
    assert.equal(field.error, 'Please fill in');
    assert.equal(instance.state.apiFieldErrors.approval_reason, 'Please fill in');

    listeners.get('input')({target: field});
    assert.equal(field.error, null);
    assert.equal(instance.state.apiFieldErrors.approval_reason, undefined);
    assert.deepEqual(notifications, ['Decision note: Please fill in']);
});

test('requestApi uses a toast when a field error has no inline target', () => {
    const {eventSystemManager, notifications} = setup();
    const form = {fields: {}, inline: {}};

    eventSystemManager.handleRequestApiFailure({
        data: {
            success: false,
            message: 'Validation failed',
            errors: {unknown_field: 'Please fill in'}
        }
    }, {form}, 'Validation failed');

    assert.deepEqual(notifications, ['Please fill in']);
});

test('requestApi keeps the generic toast for non-field API errors', () => {
    const {eventSystemManager, notifications} = setup();

    eventSystemManager.handleRequestApiFailure({
        data: {success: false, message: 'Permission required', errors: null}
    }, {form: {}}, 'Request failed.');

    assert.deepEqual(notifications, ['Permission required']);
});

test('requestApi does not repeat a formErrors action ResponseHandler already ran', () => {
    const {eventSystemManager, notifications} = setup();
    const field = {label: 'Decision note', focus() {}};
    const form = {fields: {approval_reason: field}, inline: {approval_reason: true}};

    eventSystemManager.handleRequestApiFailure({
        data: {success: false, message: 'Validation failed', errors: {approval_reason: 'Please fill in'}}
    }, {form}, 'Validation failed', {formErrors: true});

    assert.equal(field.error, undefined);
    assert.deepEqual(notifications, []);
});

test('requestApi only marks the fields when a notification action already told the user', () => {
    const {eventSystemManager, notifications} = setup();
    const field = {label: 'Decision note', focus() {this.focused = true;}};
    const form = {fields: {approval_reason: field}, inline: {approval_reason: true}};

    eventSystemManager.handleRequestApiFailure({
        data: {success: false, message: 'Validation failed', errors: {approval_reason: 'Please fill in'}}
    }, {form}, 'Validation failed', {notification: true});

    assert.equal(field.error, 'Please fill in');
    assert.equal(field.focused, true);
    assert.deepEqual(notifications, []);
});

test('requestApi without a field error map stays quiet after a notification action', () => {
    const {eventSystemManager, notifications} = setup();

    eventSystemManager.handleRequestApiFailure({
        data: {success: false, message: 'Permission required', errors: null}
    }, {form: {}}, 'Request failed.', {notification: true});

    assert.deepEqual(notifications, []);
});

test('FormManager includes mapped and unmapped field errors in one toast', async () => {
    const {formManager, notifications} = setup();
    formManager.emitEvent = () => {};
    const field = {
        name: 'approval_reason',
        label: 'Decision note',
        dataset: {},
        focus() {},
        scrollIntoView() {}
    };
    formManager.getFieldLabel = field => field.label || field.name || field.id || '';
    const form = {fields: {approval_reason: field}, inline: {approval_reason: true}};
    const instance = {
        id: 'review',
        element: form,
        config: {showErrorsInNotification: true, showErrorsInline: true},
        state: {apiFieldErrors: {}, errors: {}}
    };

    await formManager.handleFailedSubmit(instance, {
        success: false,
        message: 'Validation failed',
        errors: {approval_reason: 'Please fill in', unknown_field: 'Unknown field'}
    });

    assert.deepEqual(notifications, ['• Decision note: Please fill in\n• Unknown field']);
});