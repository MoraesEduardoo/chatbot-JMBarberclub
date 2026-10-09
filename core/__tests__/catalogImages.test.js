import test from "node:test";
import assert from "node:assert/strict";
import { resolveHaircutImageUrl } from "../../services/repositories/catalogRepository.js";

test("resolveHaircutImageUrl: sanitiza caminhos e evita erro 400 Bad Request no Supabase Storage", async (t) => {
  const fakeSupabase = {
    storage: {
      from(bucket) {
        return {
          getPublicUrl(cleanPath) {
            return {
              data: {
                publicUrl: `https://fake-project.supabase.co/storage/v1/object/public/${bucket}/${cleanPath}`,
              },
            };
          },
        };
      },
    },
  };

  await t.test("trata caminho simples sem bucket", () => {
    const url = resolveHaircutImageUrl(fakeSupabase, "corte-degrade.webp");
    assert.equal(
      url,
      "https://fake-project.supabase.co/storage/v1/object/public/haircut-gallery/corte-degrade.webp"
    );
  });

  await t.test("remove barras duplas e barras no início", () => {
    const url = resolveHaircutImageUrl(fakeSupabase, "/haircut-gallery//corte-degrade.webp");
    assert.equal(
      url,
      "https://fake-project.supabase.co/storage/v1/object/public/haircut-gallery/corte-degrade.webp"
    );
  });

  await t.test("remove repetição acidental do nome do bucket", () => {
    const url = resolveHaircutImageUrl(
      fakeSupabase,
      "haircut-gallery/haircut-gallery/corte-degrade.webp"
    );
    assert.equal(
      url,
      "https://fake-project.supabase.co/storage/v1/object/public/haircut-gallery/corte-degrade.webp"
    );
  });

  await t.test("sanitiza URL completa com barras duplas", () => {
    const raw =
      "https://fake-project.supabase.co/storage/v1/object/public/haircut-gallery//pasta//corte.webp";
    const url = resolveHaircutImageUrl(fakeSupabase, raw);
    assert.equal(
      url,
      "https://fake-project.supabase.co/storage/v1/object/public/haircut-gallery/pasta/corte.webp"
    );
  });

  await t.test("sanitiza URL completa com bucket repetido", () => {
    const raw =
      "https://fake-project.supabase.co/storage/v1/object/public/haircut-gallery/haircut-gallery/corte.webp";
    const url = resolveHaircutImageUrl(fakeSupabase, raw);
    assert.equal(
      url,
      "https://fake-project.supabase.co/storage/v1/object/public/haircut-gallery/corte.webp"
    );
  });

  await t.test("retorna vazio para valores nulos, vazios ou inválidos (ativando o fallback do card)", () => {
    assert.equal(resolveHaircutImageUrl(fakeSupabase, null), "");
    assert.equal(resolveHaircutImageUrl(fakeSupabase, undefined), "");
    assert.equal(resolveHaircutImageUrl(fakeSupabase, "   "), "");
    assert.equal(resolveHaircutImageUrl(fakeSupabase, "///"), "");
  });
});
