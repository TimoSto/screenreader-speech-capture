export interface ResizeBuffer {
  /**
   * Changes the cap of the speech buffer (`buffer.maxEntries`). A smaller one drops the oldest
   * entries at once; ended sessions that lose their last entry are forgotten.
   */
  setMaxEntries(maxEntries: number): void;
}
