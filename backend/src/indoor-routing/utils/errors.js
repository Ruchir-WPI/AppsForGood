class AppError extends Error {
  constructor(message, { code = "APP_ERROR", statusCode = 500, details = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, {
      code: "VALIDATION_ERROR",
      statusCode: 400,
      details,
    });
  }
}

class NotFoundError extends AppError {
  constructor(message, details = null) {
    super(message, {
      code: "NOT_FOUND",
      statusCode: 404,
      details,
    });
  }
}

class RouteNotFoundError extends AppError {
  constructor(message, details = null) {
    super(message, {
      code: "ROUTE_NOT_FOUND",
      statusCode: 404,
      details,
    });
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  RouteNotFoundError,
};
