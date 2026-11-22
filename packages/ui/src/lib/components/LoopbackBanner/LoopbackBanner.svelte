<script lang="ts">
  import '@material/web/icon/icon.js';
</script>

<!-- Static: it is rendered once, and must not be read as a live announcement itself. -->
<div class="banner" role="note">
  <md-icon aria-hidden="true">warning</md-icon>
  <p>
    <strong>The speech log is hidden from the screen reader (aria-hidden).</strong>
    This page is opened on the bridge's own machine (loopback address): the screen reader would read new
    rows aloud and they would be recorded again. Open the UI from another machine to read the log with
    a screen reader.
  </p>
</div>

<style>
  .banner {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    background: var(--app-warning-container);
    color: var(--app-on-warning-container);
    font-size: 14px;
    line-height: 20px;
  }

  p {
    flex: 1;
    min-width: 0;
    margin: 0;
  }

  md-icon {
    flex: none;
  }
</style>
