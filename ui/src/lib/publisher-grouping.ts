import type { PublisherConfig } from "./panel-types";
import { getEndpointType } from "./endpoint-utils";

export type PublisherLeafNode = {
  kind: "publisher";
  id: string;
  label: string;
  publisher: PublisherConfig;
  publisherIndex: number;
  endpointType: string;
  tooltip?: string;
};

export type PublisherGroupNode = {
  kind: "group";
  id: string;
  label: string;
  children: PublisherTreeNode[];
  endpointType?: string;
  tooltip?: string;
};

export type PublisherTreeNode = PublisherGroupNode | PublisherLeafNode;

const HTTP_METHOD_SORT_ORDER = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const GROUP_DELIMITERS = /[./]/;

type SortKey = ReturnType<typeof buildLeafSortKey>;

type MutableLeaf = PublisherLeafNode & {
  sortKey: SortKey;
};

type PathTrieNode = {
  segment: string;
  pathKey: string;
  exactLeaves: MutableLeaf[];
  children: Map<string, PathTrieNode>;
};

type GroupBucket = {
  id: string;
  label: string;
  endpointType: string;
  tooltip: string;
  leaves: MutableLeaf[];
  pathRoot?: PathTrieNode;
};

function normalizeSegment(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sanitizeTooltipValue(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return trimmed.replace(/\/\/([^/@:\s]+):([^@/\s]+)@/g, "//$1@");
  }
}

function fallbackLeafId(publisher: PublisherConfig, publisherIndex: number) {
  return String(publisher.id || publisher.name || publisherIndex);
}

function getHttpMethod(publisher: PublisherConfig) {
  const http = publisher.endpoint?.http;
  const value = http && typeof http === "object" ? (http as Record<string, unknown>).method : undefined;
  return String(value || "POST").toUpperCase();
}

function parseHttpPath(rawUrl: string, rawPath: string) {
  const trimmedPath = String(rawPath || "").trim();
  if (trimmedPath) {
    return trimmedPath;
  }

  const trimmedUrl = String(rawUrl || "").trim();
  if (!trimmedUrl) {
    return "";
  }

  try {
    const parsed = new URL(trimmedUrl);
    return `${parsed.pathname || "/"}${parsed.search || ""}`;
  } catch {
    const slashIndex = trimmedUrl.indexOf("/");
    return slashIndex >= 0 ? trimmedUrl.slice(slashIndex) : "";
  }
}

function splitPathSegments(path: string) {
  const [pathname] = String(path || "").split("?");
  return pathname
    .split("/")
    .map(normalizeSegment)
    .filter(Boolean);
}

function splitMessagingSegments(value: string) {
  return String(value || "")
    .split(GROUP_DELIMITERS)
    .map(normalizeSegment)
    .filter(Boolean);
}

function formatHttpSegments(segments: string[]) {
  return segments.length === 0 ? "/" : `/${segments.join("/")}/`;
}

function displayUrlWithoutScheme(rawUrl: string) {
  const safe = sanitizeTooltipValue(rawUrl);
  if (!safe) return "";
  return safe.replace(/^[a-z]+:\/\//i, "").replace(/\/$/, "");
}

function buildLeafSortKey(publisher: PublisherConfig, endpointType: string, targetSummary: string) {
  const manualOrder = Number.isFinite(publisher.sort_order) ? Number(publisher.sort_order) : Number.MAX_SAFE_INTEGER;
  const method = getHttpMethod(publisher);
  const methodIndex = HTTP_METHOD_SORT_ORDER.indexOf(method);
  const methodOrder = endpointType === "http"
    ? (methodIndex === -1 ? HTTP_METHOD_SORT_ORDER.length : methodIndex)
    : Number.MAX_SAFE_INTEGER - 1;

  return {
    manualOrder,
    methodOrder,
    targetSummary: targetSummary.toLowerCase(),
    label: String(publisher.name || "").toLowerCase(),
  };
}

function sortLeaves(leaves: MutableLeaf[]) {
  return [...leaves].sort((left, right) =>
    left.sortKey.manualOrder - right.sortKey.manualOrder
    || left.sortKey.methodOrder - right.sortKey.methodOrder
    || left.sortKey.targetSummary.localeCompare(right.sortKey.targetSummary)
    || left.sortKey.label.localeCompare(right.sortKey.label));
}

function createPathTrieNode(segment: string, pathKey: string): PathTrieNode {
  return {
    segment,
    pathKey,
    exactLeaves: [],
    children: new Map(),
  };
}

function createHttpLeaf(
  publisher: PublisherConfig,
  publisherIndex: number,
  rawUrl: string,
  path: string,
) {
  const endpointType = "HTTP";
  const publisherName = String(publisher.name || "").trim();
  const baseTarget = displayUrlWithoutScheme(rawUrl);
  const fullTarget = path && baseTarget.endsWith(path) ? baseTarget : `${baseTarget}${path || ""}`;
  return {
    kind: "publisher",
    id: fallbackLeafId(publisher, publisherIndex),
    label: publisherName || fullTarget || "/",
    publisher,
    publisherIndex,
    endpointType,
    tooltip: fullTarget,
    sortKey: buildLeafSortKey(publisher, "http", `${path}|${publisherName}`),
  } satisfies MutableLeaf;
}

function countTrieLeaves(node: PathTrieNode): number {
  return node.exactLeaves.length + [...node.children.values()].reduce((sum, child) => sum + countTrieLeaves(child), 0);
}

function toRelativeHttpLeaf(leaf: MutableLeaf, segments: string[]): PublisherLeafNode {
  const publisherName = String(leaf.publisher.name || "").trim();
  const pathLabel = formatHttpSegments(segments);
  return {
    kind: "publisher",
    id: leaf.id,
    label: `${getHttpMethod(leaf.publisher)} ${pathLabel}${publisherName ? ` (${publisherName})` : ""}`,
    publisher: leaf.publisher,
    publisherIndex: leaf.publisherIndex,
    endpointType: leaf.endpointType,
    tooltip: leaf.tooltip,
  };
}

function flattenSingleDescendant(node: PathTrieNode, segments: string[]): PublisherLeafNode | null {
  if (countTrieLeaves(node) !== 1) return null;
  if (node.exactLeaves.length === 1) {
    return toRelativeHttpLeaf(node.exactLeaves[0], segments);
  }
  const onlyChild = [...node.children.values()][0];
  return onlyChild ? flattenSingleDescendant(onlyChild, [...segments, onlyChild.segment]) : null;
}

function materializeHttpNodes(node: PathTrieNode, rootId: string, inheritedSegments: string[] = []): PublisherTreeNode[] {
  let currentNode = node;
  let currentSegments = [...inheritedSegments];

  while (currentSegments.length > 0 && currentNode.exactLeaves.length === 0 && currentNode.children.size === 1) {
    const onlyChild = [...currentNode.children.values()][0];
    currentNode = onlyChild;
    currentSegments = [...currentSegments, onlyChild.segment];
  }

  const exactLeaves = sortLeaves(currentNode.exactLeaves).map((leaf) => toRelativeHttpLeaf(leaf, currentSegments));
  const childEntries = [...currentNode.children.values()].sort((left, right) => left.segment.localeCompare(right.segment));
  const childNodes: PublisherTreeNode[] = [];
  for (const child of childEntries) {
    const childSegments = [...currentSegments, child.segment];
    const flattened = flattenSingleDescendant(child, childSegments);
    if (flattened) {
      childNodes.push(flattened);
    } else {
      childNodes.push(...materializeHttpNodes(child, rootId, childSegments));
    }
  }

  const mergedChildren = [...exactLeaves, ...childNodes];
  if (currentSegments.length === 0) {
    return mergedChildren;
  }

  return [{
    kind: "group",
    id: `${rootId}:path:${currentNode.pathKey || currentSegments.join("/")}`,
    label: formatHttpSegments(currentSegments),
    children: mergedChildren,
  }];
}

function addHttpPublisherToBucket(bucket: GroupBucket, publisher: PublisherConfig, publisherIndex: number) {
  const http = publisher.endpoint?.http as Record<string, unknown> | undefined;
  const rawUrl = String(http?.url || "");
  const path = parseHttpPath(rawUrl, String(http?.path || ""));
  const segments = splitPathSegments(path);

  if (!bucket.pathRoot) {
    bucket.pathRoot = createPathTrieNode("", "");
  }

  if (segments.length === 0) {
    bucket.pathRoot.exactLeaves.push(createHttpLeaf(publisher, publisherIndex, rawUrl, path));
    return;
  }

  let cursor = bucket.pathRoot;
  const builtSegments: string[] = [];
  for (const segment of segments) {
    builtSegments.push(segment);
    const nextKey = builtSegments.join("/");
    let next = cursor.children.get(segment);
    if (!next) {
      next = createPathTrieNode(segment, nextKey);
      cursor.children.set(segment, next);
    }
    cursor = next;
  }

  cursor.exactLeaves.push(createHttpLeaf(publisher, publisherIndex, rawUrl, path));
}

function buildNonHttpGroupInfo(publisher: PublisherConfig) {
  const endpointType = getEndpointType(publisher.endpoint || {});
  const endpointConfig = publisher.endpoint?.[endpointType];
  const objectConfig = endpointConfig && typeof endpointConfig === "object" ? (endpointConfig as Record<string, unknown>) : {};
  const safeUrl = sanitizeTooltipValue(String(objectConfig.url || ""));

  if (endpointType === "mongodb") {
    const database = String(objectConfig.database || "").trim();
    const collection = String(objectConfig.collection || "").trim();
    const label = `MONGODB ${displayUrlWithoutScheme(safeUrl)}${database ? `/${database}` : ""}${collection ? `/${collection}` : ""}`;
    return {
      endpointType: "MONGODB",
      groupKey: `mongodb:${safeUrl}:${database}:${collection}`,
      groupLabel: label.trim(),
      tooltip: safeUrl,
      leafLabel: publisher.name,
      leafTooltip: `${database}/${collection}`.replace(/^\/+|\/+$/g, "") || safeUrl,
      sortTarget: `${database}/${collection}|${publisher.name}`,
    };
  }

  const target = String(
    objectConfig.subject
      || objectConfig.topic
      || objectConfig.queue
      || objectConfig.routing_key
      || objectConfig.routingKey
      || objectConfig.table
      || objectConfig.path
      || "",
  ).trim();
  const firstSegment = splitMessagingSegments(target)[0] || target || "Ungrouped";
  return {
    endpointType: endpointType.toUpperCase(),
    groupKey: `${endpointType}:${safeUrl}:${firstSegment}`,
    groupLabel: `${endpointType.toUpperCase()} ${displayUrlWithoutScheme(safeUrl) || firstSegment}`.trim(),
    tooltip: safeUrl || target,
    leafLabel: `${target || publisher.name}${publisher.name ? ` (${publisher.name})` : ""}`,
    leafTooltip: target || safeUrl,
    sortTarget: `${target}|${publisher.name}`,
  };
}

export function buildPublisherTree(publishers: PublisherConfig[]): PublisherTreeNode[] {
  const groups = new Map<string, GroupBucket>();

  publishers.forEach((publisher, publisherIndex) => {
    const endpointType = getEndpointType(publisher.endpoint || {});

    if (endpointType === "http") {
      const http = publisher.endpoint?.http as Record<string, unknown> | undefined;
      const rawUrl = String(http?.url || "");
      const safeUrl = sanitizeTooltipValue(rawUrl);
      const groupLabel = `HTTP ${displayUrlWithoutScheme(rawUrl) || "Ungrouped"}`.trim();
      const groupKey = `http:${safeUrl || groupLabel}`;
      let bucket = groups.get(groupKey);
      if (!bucket) {
        bucket = {
          id: groupKey,
          label: groupLabel,
          endpointType: "HTTP",
          tooltip: safeUrl,
          leaves: [],
          pathRoot: createPathTrieNode("", ""),
        };
        groups.set(groupKey, bucket);
      }
      addHttpPublisherToBucket(bucket, publisher, publisherIndex);
      return;
    }

    const info = buildNonHttpGroupInfo(publisher);
    let bucket = groups.get(info.groupKey);
    if (!bucket) {
      bucket = {
        id: info.groupKey,
        label: info.groupLabel,
        endpointType: info.endpointType,
        tooltip: info.tooltip,
        leaves: [],
      };
      groups.set(info.groupKey, bucket);
    }
    bucket.leaves.push({
      kind: "publisher",
      id: fallbackLeafId(publisher, publisherIndex),
      label: info.leafLabel,
      publisher,
      publisherIndex,
      endpointType: info.endpointType,
      tooltip: info.leafTooltip,
      sortKey: buildLeafSortKey(publisher, endpointType, info.sortTarget),
    });
  });

  return [...groups.values()]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((bucket) => {
      const children = bucket.pathRoot
        ? materializeHttpNodes(bucket.pathRoot, bucket.id)
        : sortLeaves(bucket.leaves).map((leaf) => ({
            kind: "publisher",
            id: leaf.id,
            label: leaf.label,
            publisher: leaf.publisher,
            publisherIndex: leaf.publisherIndex,
            endpointType: leaf.endpointType,
            tooltip: leaf.tooltip,
          })) satisfies PublisherLeafNode[];

      if (children.length === 1 && children[0]?.kind === "publisher") {
        const onlyLeaf = children[0];
        const name = String(onlyLeaf.publisher.name || "").trim();
        return {
          kind: "publisher",
          id: onlyLeaf.id,
          label: name || onlyLeaf.tooltip || bucket.label,
          publisher: onlyLeaf.publisher,
          publisherIndex: onlyLeaf.publisherIndex,
          endpointType: onlyLeaf.endpointType,
          tooltip: bucket.tooltip || onlyLeaf.tooltip,
        } satisfies PublisherLeafNode;
      }

      return {
        kind: "group",
        id: bucket.id,
        label: bucket.label,
        endpointType: bucket.endpointType,
        tooltip: bucket.tooltip,
        children,
      } satisfies PublisherGroupNode;
    });
}
