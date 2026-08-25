# Branch info

This is a backup for the search bar and the toggles for local and remote terms.

```html
<div id="terminology-section-utility-container" class="d-print-none alert alert-primary p-3"><div class="row g-2" id="utility-row"><div class="col-auto d-flex align-items-center"><small class="text-muted mb-0">9 terms</small></div><div class="col d-flex flex-wrap align-items-center gap-3"><div class="d-flex gap-3"><div class="form-check">
        <input class="form-check-input" type="checkbox" id="showLocalTermsCheckbox" checked="">
        <label class="form-check-label" for="showLocalTermsCheckbox">
            Local
        </label>
    </div><div class="form-check">
        <input class="form-check-input" type="checkbox" id="showExternalTermsCheckbox" checked="">
        <label class="form-check-label" for="showExternalTermsCheckbox">
            Remote
        </label>
    </div></div></div><div class="col-auto d-flex justify-content-end"><div id="container-search" class="input-group input-group-sm" role="search"><input type="text" id="search" class="form-control" placeholder="🔍 (terms only)" aria-label="Search terms" autocomplete="off"><span id="total-matches-search" class="input-group-text" aria-live="polite" role="status">0 matches</span><div class="input-group-text p-0"><button id="one-match-backward-search" class="btn btn-outline-secondary" type="button" disabled="true" title="Go to previous match (Left Arrow)" aria-label="Go to previous match"><span aria-hidden="true">▲</span></button><button id="one-match-forward-search" class="btn btn-outline-secondary" type="button" disabled="true" title="Go to next match (Right Arrow)" aria-label="Go to next match"><span aria-hidden="true">▼</span></button></div></div></div></div></div>
    ```
