import { describe, expect, it } from "vitest";
import { mapPoolProgress } from "./pool";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("mapPoolProgress", () => {
  it("reports fast results immediately while preserving final input order", async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    const started: number[] = [];
    const progress: Array<[string, number]> = [];
    const pending = mapPoolProgress(
      [0, 1, 2],
      2,
      async (index) => {
        started.push(index);
        return gates[index]!.promise;
      },
      (value, index) => progress.push([value, index]),
    );

    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    gates[1]!.resolve("second");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(progress).toEqual([["second", 1]]);
    expect(started).toEqual([0, 1, 2]);

    gates[2]!.resolve("third");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(progress).toEqual([
      ["second", 1],
      ["third", 2],
    ]);

    gates[0]!.resolve("first");
    await expect(pending).resolves.toEqual(["first", "second", "third"]);
    expect(progress).toEqual([
      ["second", 1],
      ["third", 2],
      ["first", 0],
    ]);
  });
});
