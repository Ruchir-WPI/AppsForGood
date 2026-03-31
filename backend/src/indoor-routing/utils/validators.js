const { ValidationError } = require("./errors");

function assertObject(value, fieldName) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ValidationError(`${fieldName} must be an object.`);
    }
}

function assertNonEmptyString(value, fieldName) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ValidationError(`${fieldName} must be a non-empty string.`);
    }
}

function assertOptionalString(value, fieldName) {
    if (value === undefined || value === null) {
        return;
    }

    if (typeof value !== "string") {
        throw new ValidationError(`${fieldName} must be a string when provided.`);
    }
}

function assertFiniteNumber(value, fieldName) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ValidationError(`${fieldName} must be a finite number.`);
    }
}

function assertBoolean(value, fieldName) {
    if (typeof value !== "boolean") {
        throw new ValidationError(`${fieldName} must be a boolean.`);
    }
}

function assertArray(value, fieldName) {
    if (!Array.isArray(value)) {
        throw new ValidationError(`${fieldName} must be an array.`);
    }
}

module.exports = {
    assertObject,
    assertNonEmptyString,
    assertOptionalString,
    assertFiniteNumber,
    assertBoolean,
    assertArray,
};
