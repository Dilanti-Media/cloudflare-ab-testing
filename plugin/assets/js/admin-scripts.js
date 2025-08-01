/**
 * Cloudflare A/B Testing Plugin - Admin Scripts
 * Enhanced admin interface functionality
 */

(function ($) {
    "use strict";

    // Initialize on document ready
    $(document).ready(function () {
        initializeAdminInterface();
        setupFormValidation();
        setupProgressIndicators();
        setupWorkerManagement();
        setupTestConfiguration();
    });

    /**
     * Initialize admin interface enhancements
     */
    function initializeAdminInterface() {
        // Add fade-in animation to main content
        $(".cloudflare-ab-admin").addClass("ab-fade-in");

        // Add slide-in animation to cards
        $(".ab-status-card").each(function (index) {
            $(this)
                .delay(index * 100)
                .addClass("ab-slide-in");
        });

        // Setup tooltips
        setupTooltips();

        // Setup copy-to-clipboard functionality
        setupCopyToClipboard();
    }

    /**
     * Setup form validation
     */
    function setupFormValidation() {
        // Real-time validation for required fields
        $("input[required], textarea[required], select[required]").on(
            "blur",
            function () {
                validateField($(this));
            },
        );

        // Validate form on submit
        $("form").on("submit", function (e) {
            if (!validateForm($(this))) {
                e.preventDefault();
                showNotification("Please fix the errors before submitting.", "error");
            }
        });
    }

    /**
     * Validate individual field
     */
    function validateField($field) {
        const value = $field.val().trim();
        const fieldName = $field.attr("name") || "field";

        // Remove existing validation styling
        $field.removeClass("ab-field-error ab-field-success");
        $field.siblings(".ab-field-error-message").remove();

        // Check if required field is empty
        if ($field.attr("required") && !value) {
            $field.addClass("ab-field-error");
            $field.after(
                '<div class="ab-field-error-message">This field is required</div>',
            );
            return false;
        }

        // Validate specific field types
        if (fieldName.includes("account_id") && value) {
            if (!/^[a-f0-9]{32}$/.test(value)) {
                $field.addClass("ab-field-error");
                $field.after(
                    '<div class="ab-field-error-message">Account ID should be 32 characters long</div>',
                );
                return false;
            }
        }

        if (fieldName.includes("namespace_id") && value) {
            if (!/^[a-f0-9]{32}$/.test(value)) {
                $field.addClass("ab-field-error");
                $field.after(
                    '<div class="ab-field-error-message">Namespace ID should be 32 characters long</div>',
                );
                return false;
            }
        }

        if (fieldName.includes("api_token") && value) {
            if (!/^[A-Za-z0-9_-]{40}$/.test(value)) {
                $field.addClass("ab-field-error");
                $field.after(
                    '<div class="ab-field-error-message">API Token format appears invalid</div>',
                );
                return false;
            }
        }

        // Field is valid
        if (value) {
            $field.addClass("ab-field-success");
        }

        return true;
    }

    /**
     * Validate entire form
     */
    function validateForm($form) {
        let isValid = true;

        $form
            .find("input[required], textarea[required], select[required]")
            .each(function () {
                if (!validateField($(this))) {
                    isValid = false;
                }
            });

        return isValid;
    }

    /**
     * Setup progress indicators
     */
    function setupProgressIndicators() {
        // Show progress on form submissions
        $("form").on("submit", function () {
            const $form = $(this);
            const $submitBtn = $form.find(
                'input[type="submit"], button[type="submit"]',
            );

            if ($submitBtn.length) {
                $submitBtn.addClass("ab-btn-loading").prop("disabled", true);

                // Reset after 10 seconds as failsafe
                setTimeout(() => {
                    $submitBtn.removeClass("ab-btn-loading").prop("disabled", false);
                }, 10000);
            }
        });
    }

    /**
     * Setup worker management functionality
     */
    function setupWorkerManagement() {
        // Save worker version selection when it changes
        $("#worker-version").on("change", function () {
            const workerVersion = $(this).val();

            // Save the selection via AJAX
            $.ajax({
                url: ajaxurl,
                type: "POST",
                data: {
                    action: "cloudflare_ab_save_worker_version",
                    worker_version: workerVersion,
                    nonce: cloudflareAbAdmin.nonce,
                },
                success: function (response) {
                    if (response.success) {
                        showNotification("Worker version preference saved", "success");
                    }
                },
            });
        });

        // Worker deployment
        $(".ab-deploy-worker").on("click", function (e) {
            e.preventDefault();

            const $btn = $(this);
            const workerType = $("#worker-version").val() || "simple";

            deployWorker(workerType, $btn);
        });

        // Worker update
        $(".ab-update-worker").on("click", function (e) {
            e.preventDefault();

            const $btn = $(this);
            const workerType = $("#worker-version").val() || "simple";

            updateWorker(workerType, $btn);
        });

        // Worker deletion with confirmation
        $(".ab-delete-worker").on("click", function (e) {
            e.preventDefault();

            if (
                confirm(
                    "Are you sure you want to delete the worker? This action cannot be undone.",
                )
            ) {
                const $btn = $(this);
                deleteWorker($btn);
            }
        });
    }

    /**
     * Deploy worker via AJAX
     */
    function deployWorker(workerType, $btn) {
        $btn.addClass("ab-btn-loading").prop("disabled", true);

        $.ajax({
            url: ajaxurl,
            type: "POST",
            data: {
                action: "cloudflare_ab_deploy_worker",
                worker_type: workerType,
                nonce: cloudflareAbAdmin.nonce,
            },
            success: function (response) {
                if (response.success) {
                    showNotification("Worker deployed successfully!", "success");
                    updateWorkerStatus("active");
                } else {
                    showNotification(
                        "Worker deployment failed: " + response.data,
                        "error",
                    );
                }
            },
            error: function () {
                showNotification("Network error occurred. Please try again.", "error");
            },
            complete: function () {
                $btn.removeClass("ab-btn-loading").prop("disabled", false);
            },
        });
    }

    /**
     * Update worker via AJAX
     */
    function updateWorker(workerType, $btn) {
        $btn.addClass("ab-btn-loading").prop("disabled", true);

        $.ajax({
            url: ajaxurl,
            type: "POST",
            data: {
                action: "cloudflare_ab_update_worker",
                worker_type: workerType,
                nonce: cloudflareAbAdmin.nonce,
            },
            success: function (response) {
                if (response.success) {
                    showNotification("Worker updated successfully!", "success");
                } else {
                    showNotification("Worker update failed: " + response.data, "error");
                }
            },
            error: function () {
                showNotification("Network error occurred. Please try again.", "error");
            },
            complete: function () {
                $btn.removeClass("ab-btn-loading").prop("disabled", false);
            },
        });
    }

    /**
     * Delete worker via AJAX
     */
    function deleteWorker($btn) {
        $btn.addClass("ab-btn-loading").prop("disabled", true);

        $.ajax({
            url: ajaxurl,
            type: "POST",
            data: {
                action: "cloudflare_ab_delete_worker",
                nonce: cloudflareAbAdmin.nonce,
            },
            success: function (response) {
                if (response.success) {
                    showNotification("Worker deleted successfully!", "success");
                    updateWorkerStatus("inactive");
                } else {
                    showNotification("Worker deletion failed: " + response.data, "error");
                }
            },
            error: function () {
                showNotification("Network error occurred. Please try again.", "error");
            },
            complete: function () {
                $btn.removeClass("ab-btn-loading").prop("disabled", false);
            },
        });
    }

    /**
     * Setup test configuration helpers
     */
    function setupTestConfiguration() {
        // Add test configuration helper
        $(".ab-add-test-config").on("click", function (e) {
            e.preventDefault();

            const testName = prompt('Enter test name (e.g., "homepage_banner"):');
            const testPaths = prompt(
                'Enter test paths (comma-separated, e.g., "/,/home"):',
            );

            if (testName && testPaths) {
                const $textarea = $('textarea[name="cloudflare_ab_enabled_urls"]');
                const currentValue = $textarea.val().trim();
                const newLine = testName + "|" + testPaths;

                if (currentValue) {
                    $textarea.val(currentValue + "\n" + newLine);
                } else {
                    $textarea.val(newLine);
                }

                showNotification("Test configuration added!", "success");
            }
        });

        // Validate test configuration format
        $('textarea[name="cloudflare_ab_enabled_urls"]').on("blur", function () {
            validateTestConfiguration($(this));
        });
    }

    /**
     * Validate test configuration format
     */
    function validateTestConfiguration($textarea) {
        const value = $textarea.val().trim();
        const lines = value.split("\n");
        let errors = [];

        lines.forEach((line, index) => {
            line = line.trim();
            if (!line) return;

            if (!line.includes("|")) {
                errors.push(`Line ${index + 1}: Missing '|' separator`);
                return;
            }

            const parts = line.split("|");
            if (parts.length !== 2) {
                errors.push(`Line ${index + 1}: Invalid format`);
                return;
            }

            const testName = parts[0].trim();
            const paths = parts[1].trim();

            if (!testName) {
                errors.push(`Line ${index + 1}: Test name is required`);
            }

            if (!paths) {
                errors.push(`Line ${index + 1}: At least one path is required`);
            }

            // Check if paths start with '/'
            const pathList = paths.split(",").map((p) => p.trim());
            pathList.forEach((path) => {
                if (path && !path.startsWith("/")) {
                    errors.push(
                        `Line ${index + 1}: Path "${path}" should start with '/'`,
                    );
                }
            });
        });

        // Remove existing validation messages
        $textarea.siblings(".ab-field-error-message").remove();
        $textarea.removeClass("ab-field-error ab-field-success");

        if (errors.length > 0) {
            $textarea.addClass("ab-field-error");
            $textarea.after(
                '<div class="ab-field-error-message">' + errors.join("<br>") + "</div>",
            );
            return false;
        } else if (value) {
            $textarea.addClass("ab-field-success");
        }

        return true;
    }

    /**
     * Update worker status display
     */
    function updateWorkerStatus(status) {
        const $statusEl = $(".ab-worker-status");
        const $icon = $statusEl.find(".ab-worker-status-icon");
        const $text = $statusEl.find(".ab-worker-status-text");

        $statusEl.removeClass("active inactive");

        if (status === "active") {
            $statusEl.addClass("active");
            $icon.html("✅");
            $text.text("Worker is active and processing requests");
        } else {
            $statusEl.addClass("inactive");
            $icon.html("❌");
            $text.text("Worker is not deployed or inactive");
        }
    }

    /**
     * Setup tooltips
     */
    function setupTooltips() {
        // Simple tooltip implementation
        $("[data-tooltip]").each(function () {
            const $el = $(this);
            const tooltipText = $el.data("tooltip");

            $el.on("mouseenter", function () {
                const $tooltip = $('<div class="ab-tooltip">' + tooltipText + "</div>");
                $("body").append($tooltip);

                const rect = this.getBoundingClientRect();
                $tooltip.css({
                    position: "absolute",
                    top: rect.top - $tooltip.outerHeight() - 10,
                    left: rect.left + (rect.width - $tooltip.outerWidth()) / 2,
                    zIndex: 9999,
                });
            });

            $el.on("mouseleave", function () {
                $(".ab-tooltip").remove();
            });
        });
    }

    /**
     * Setup copy-to-clipboard functionality
     */
    function setupCopyToClipboard() {
        $(".ab-copy-btn").on("click", function (e) {
            e.preventDefault();

            const $btn = $(this);
            const targetSelector = $btn.data("target");
            const $target = $(targetSelector);

            if ($target.length) {
                const text = $target.is("input, textarea")
                    ? $target.val()
                    : $target.text();

                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).then(() => {
                        showNotification("Copied to clipboard!", "success");
                    });
                } else {
                    // Fallback for older browsers
                    const $temp = $("<textarea>");
                    $("body").append($temp);
                    $temp.val(text).select();
                    document.execCommand("copy");
                    $temp.remove();
                    showNotification("Copied to clipboard!", "success");
                }
            }
        });
    }

    /**
     * Show notification to user
     */
    function showNotification(message, type = "info") {
        const icons = {
            success: "✅",
            error: "❌",
            warning: "⚠️",
            info: "ℹ️",
        };

        const $notification = $(`
            <div class="ab-notification ab-notification-${type}">
                <span class="ab-notification-icon">${icons[type]}</span>
                <span class="ab-notification-message">${message}</span>
                <button class="ab-notification-close">&times;</button>
            </div>
        `);

        $("body").append($notification);

        // Position notification
        $notification.css({
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 99999,
        });

        // Auto-hide after 5 seconds
        setTimeout(() => {
            $notification.fadeOut(() => $notification.remove());
        }, 5000);

        // Manual close
        $notification.find(".ab-notification-close").on("click", () => {
            $notification.fadeOut(() => $notification.remove());
        });
    }
})(jQuery);

// Add notification styles
const notificationStyles = `
<style>
.ab-notification {
    background: white;
    border-radius: 6px;
    padding: 15px;
    margin-bottom: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 300px;
    animation: slideInRight 0.3s ease-out;
}

@keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}

.ab-notification-success { border-left: 4px solid #00a32a; }
.ab-notification-error { border-left: 4px solid #d63638; }
.ab-notification-warning { border-left: 4px solid #dba617; }
.ab-notification-info { border-left: 4px solid #0073aa; }

.ab-notification-icon {
    font-size: 1.2rem;
}

.ab-notification-message {
    flex: 1;
    font-size: 14px;
    color: #1e1e1e;
}

.ab-notification-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.ab-notification-close:hover {
    color: #333;
}

.ab-tooltip {
    background: #333;
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    max-width: 200px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.ab-field-error {
    border-color: #d63638 !important;
    box-shadow: 0 0 0 3px rgba(214, 54, 56, 0.1) !important;
}

.ab-field-success {
    border-color: #00a32a !important;
    box-shadow: 0 0 0 3px rgba(0, 163, 42, 0.1) !important;
}

.ab-field-error-message {
    color: #d63638;
    font-size: 12px;
    margin-top: 5px;
    display: block;
}
</style>
`;

// Inject notification styles
document.head.insertAdjacentHTML("beforeend", notificationStyles);
