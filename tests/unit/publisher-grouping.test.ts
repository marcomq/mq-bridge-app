import { describe, expect, test } from "vitest";
import { buildPublisherTree } from "../../ui/src/lib/publisher-grouping";
import type { PublisherConfig } from "../../ui/src/lib/panel-types";

function flattenLabels(nodes: ReturnType<typeof buildPublisherTree>): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    result.push(node.label);
    if (node.kind === "group") {
      result.push(...flattenLabels(node.children));
    }
  }
  return result;
}

describe("publisher grouping", () => {
  test("groups http publishers by path segments", () => {
    const tree = buildPublisherTree([
      {
        name: "list users",
        endpoint: { http: { url: "https://api.test", path: "/admin/users", method: "GET" } },
      },
      {
        name: "get user",
        endpoint: { http: { url: "https://api.test", path: "/admin/users/{id}", method: "GET" } },
      },
    ] as PublisherConfig[]);

    expect(flattenLabels(tree)).toEqual([
      "HTTP api.test",
      "/admin/users/",
      "GET /admin/users/ (list users)",
      "GET /admin/users/{id}/ (get user)",
    ]);
  });

  test("uses http method fallback ordering", () => {
    const tree = buildPublisherTree([
      { name: "delete user", endpoint: { http: { url: "https://api.test", path: "/users/{id}", method: "DELETE" } } },
      { name: "get user", endpoint: { http: { url: "https://api.test", path: "/users/{id}", method: "GET" } } },
      { name: "patch user", endpoint: { http: { url: "https://api.test", path: "/users/{id}", method: "PATCH" } } },
    ] as PublisherConfig[]);

    const usersGroup = tree[0];
    const pathGroup = usersGroup.kind === "group" && usersGroup.children[0]?.kind === "group"
      ? usersGroup.children[0]
      : null;
    expect(pathGroup?.label).toBe("/users/{id}/");
    expect(pathGroup?.children.map((node) => node.label)).toEqual([
      "GET /users/{id}/ (get user)",
      "PATCH /users/{id}/ (patch user)",
      "DELETE /users/{id}/ (delete user)",
    ]);
  });

  test("groups non-http publishers by subject and topic", () => {
    const tree = buildPublisherTree([
      { name: "jobs created", endpoint: { nats: { subject: "jobs.created" } } },
      { name: "orders created", endpoint: { kafka: { topic: "orders.created" } } },
    ] as PublisherConfig[]);

    expect(flattenLabels(tree)).toEqual([
      "orders created",
      "jobs created",
    ]);
  });

  test("shows single ungrouped publishers directly", () => {
    const tree = buildPublisherTree([
      { name: "write file", endpoint: { file: { path: "" } } },
    ] as PublisherConfig[]);

    expect(flattenLabels(tree)).toEqual(["write file"]);
  });

  test("respects manual ordering inside groups", () => {
    const tree = buildPublisherTree([
      {
        name: "delete user",
        sort_order: 20,
        endpoint: { http: { url: "https://api.test", path: "/users/{id}", method: "DELETE" } },
      },
      {
        name: "get user",
        sort_order: 1,
        endpoint: { http: { url: "https://api.test", path: "/users/{id}", method: "GET" } },
      },
    ] as PublisherConfig[]);

    const usersGroup = tree[0];
    const pathGroup = usersGroup.kind === "group" && usersGroup.children[0]?.kind === "group"
      ? usersGroup.children[0]
      : null;
    expect(pathGroup?.children.map((node) => node.label)).toEqual([
      "GET /users/{id}/ (get user)",
      "DELETE /users/{id}/ (delete user)",
    ]);
  });

  test("keeps stable sorting for publishers with same endpoint", () => {
    const tree = buildPublisherTree([
      { name: "alpha", endpoint: { http: { url: "https://api.test", path: "/users", method: "POST" } }, payload: "a" },
      { name: "beta", endpoint: { http: { url: "https://api.test", path: "/users", method: "POST" } }, payload: "b" },
    ] as PublisherConfig[]);

    const usersGroup = tree[0];
    const pathGroup = usersGroup.kind === "group" && usersGroup.children[0]?.kind === "group"
      ? usersGroup.children[0]
      : null;
    expect(pathGroup?.children.map((node) => node.label)).toEqual([
      "POST /users/ (alpha)",
      "POST /users/ (beta)",
    ]);
  });

  test("preserves publisher indices for selection", () => {
    const tree = buildPublisherTree([
      { name: "alpha", endpoint: { http: { url: "https://api.test", path: "/users", method: "POST" } } },
      { name: "beta", endpoint: { http: { url: "https://api.test", path: "/users/{id}", method: "GET" } } },
    ] as PublisherConfig[]);

    const usersGroup = tree[0];
    const rootUsersNode = usersGroup.kind === "group" && usersGroup.children[0]?.kind === "group"
      ? usersGroup.children[0]
      : null;
    const nestedLeaf = rootUsersNode?.children[1]?.kind === "publisher"
      ? rootUsersNode.children[1]
      : null;

    expect(nestedLeaf?.publisherIndex).toBe(1);
    expect(nestedLeaf?.publisher.name).toBe("beta");
  });

  test("keeps multi-leaf ungrouped publishers under one collapsible root", () => {
    const tree = buildPublisherTree([
      { name: "write file", endpoint: { file: { path: "" } } },
      { name: "append file", endpoint: { file: { path: "" } } },
    ] as PublisherConfig[]);

    expect(flattenLabels(tree)).toEqual(["FILE Ungrouped", "append file (append file)", "write file (write file)"]);
  });

  test("keeps exact path leaves alongside deeper child paths", () => {
    const tree = buildPublisherTree([
      { name: "order a", endpoint: { http: { url: "https://api.test", path: "/order", method: "GET" } } },
      { name: "order b", endpoint: { http: { url: "https://api.test", path: "/order", method: "POST" } } },
      { name: "order item", endpoint: { http: { url: "https://api.test", path: "/order/1", method: "GET" } } },
    ] as PublisherConfig[]);

    expect(flattenLabels(tree)).toEqual([
      "HTTP api.test",
      "/order/",
      "GET /order/ (order a)",
      "POST /order/ (order b)",
      "GET /order/1/ (order item)",
    ]);
  });
});
