import React from "react";

// A dropdown for a list that is loaded from the server. It shows different
// text while loading, when loading failed, when the list is empty, and when
// it is ready, so a broken list does not look the same as an empty one.
const STATE_LABEL = {
  loading: "Loading…",
  error: "Unable to load — try again",
  empty: "No options available",
};

export default function LiveSelect({
  state,
  options,
  value,
  onChange,
  placeholder = "—",
  className = "",
  disabled = false,
  ...rest
}) {
  const notReady = state !== "ready";
  return (
    <select
      value={notReady ? "" : value}
      onChange={onChange}
      disabled={disabled || notReady}
      className={`${className} disabled:opacity-60 disabled:cursor-not-allowed`}
      {...rest}
    >
      <option value="">{notReady ? STATE_LABEL[state] : placeholder}</option>
      {!notReady && options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
