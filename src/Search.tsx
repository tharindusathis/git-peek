import { Box, Instance, render, Text } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import qs from "qs";
import React, { useState } from "react";
import swr from "swr";
import { fetch } from "./fetch";

const ItemComponent = ({
  isSelected = false,
  label,
  description,
  maxLabelWidth,
}) => (
  <Box flexDirection="row">
    <Box width={maxLabelWidth} marginRight={1}>
      <Text color={isSelected ? "blue" : "whiteBright"}>{label}</Text>
    </Box>
    <Box justifyContent="flex-end">
      <Text wrap="truncate-end" color="white" dimColor={!isSelected}>
        | {description?.slice(0, 48)}
      </Text>
    </Box>
  </Box>
);

let query = { q: "", limit: 20, per_page: 8 };

async function getDefaultData() {
  const resp = await fetch("https://trends.now.sh/api/repos");

  const json = await resp.json();
  json.total_count = json.items?.length ?? 0;
  if (!json.items) {
    json.items = [];
  }

  if (json.items.length > query.per_page) {
    json.items = json.items.slice(0, query.per_page);
  }

  return [resp, json];
}

async function searchGithubRepository(
  _search: string,
  write: (data: string) => void
) {
  const search = _search.slice(1);

  query.q = search;

  let resp: Response;
  let body;

  if (!search.trim().length) {
    const defaults = await getDefaultData();
    resp = defaults[0];
    body = defaults[1];
  } else {
    resp = await fetch(
      `https://api.github.com/search/repositories?${qs.stringify(query)}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (resp.ok) {
      body = await resp.json();
    }
  }

  if (resp.ok) {
    if (!Number.isFinite(body.total_count)) {
      console.log("GitHub search API request failed.");
      process.exit(1);
    }
    const results = new Array(
      Math.min(body.total_count, 20, body.items.length)
    );

    let maxLabelWidth = 0;
    for (let i = 0; i < results.length; i++) {
      const item = body.items[i];

      results[i] = {
        value: `https://github.com/${item.full_name}.git#${item.default_branch}`,
        label: item.full_name.slice(0, 24),
        description: item.description,
      };

      maxLabelWidth =
        maxLabelWidth < results[i].label.length
          ? results[i].label.length
          : maxLabelWidth;
    }

    for (let result of results) {
      result.maxLabelWidth = maxLabelWidth;
    }

    return results;
  } else {
    write("GitHub search API request failed with status:" + resp.status);
    return [];
  }
}

export const SearchInput = ({ onSelect, initialQuery = "" }) => {
  const [query, setQuery] = useState(initialQuery || "");
  const { data: results, error } = swr(
    ["/" + query.trim()],
    searchGithubRepository,
    {
      isDocumentVisible: () => true,
      isOnline: () => true,
      isPaused: () => false,
    }
  );
  const lastResults = React.useRef();
  React.useEffect(() => {
    if (results?.length) {
      lastResults.current = results;
    }
  }, [results, lastResults]);

  const onSelectItem = React.useCallback((item) => onSelect(item.value), [
    onSelect,
  ]);

  return (
    <>
      <Text color="black">Search Github repositories:</Text>
      <Text>
        &gt; <TextInput value={query} onChange={setQuery} />
      </Text>

      <SelectInput
        items={results || lastResults.current}
        onSelect={onSelectItem}
        itemComponent={ItemComponent}
      />
    </>
  );
};

export function renderInk(query: string) {
  return new Promise((resolve, reject) => {
    let result: Instance;
    let didResolve = false;
    async function didSelect(value) {
      didResolve = true;
      result.unmount();
      result.cleanup();
      resolve(value);
      result = null;
    }

    try {
      result = render(
        <SearchInput onSelect={didSelect} initialQuery={query} />,
        {}
      );
    } catch (exception) {
      if (result) {
        result.unmount();
        result.cleanup();
      }

      console.error(exception);

      reject(exception);
    }

    result.waitUntilExit().then(() => {
      if (!didResolve) {
        process.exit();
      }
    });
  });
}