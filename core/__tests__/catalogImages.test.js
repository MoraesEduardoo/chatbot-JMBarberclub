import test from "node:test";
import assert from "node:assert/strict";
import { findGalleryPhoto, resolveHaircutImageUrl } from "../../services/repositories/catalogRepository.js";

test("findGalleryPhoto: mapeamento unívoco e estrito de fotos da galeria", async (t) => {
  const galleryItems = [
    { id: "img-1", title: "Degradê", category: "Cabelo", image_path: "haircut-gallery/degrade.webp" },
    { id: "img-2", title: "Degradê + Sobrancelha", category: "Combo", image_path: "haircut-gallery/combo-sobrancelha.webp" },
    { id: "img-3", title: "Barboterapia", category: "Barba", image_path: "haircut-gallery/barba.webp" },
  ];

  await t.test("associa 'Degradê' com sua foto específica", () => {
    const photo = findGalleryPhoto({ id: "degrade", name: "Degradê" }, galleryItems);
    assert.ok(photo);
    assert.equal(photo.id, "img-1");
  });

  await t.test("associa 'Degradê + Sobrancelha' com sua foto própria e NÃO duplica foto do 'Degradê'", () => {
    const usedIds = new Set(["img-1"]);
    const photo = findGalleryPhoto({ id: "degrade-sobrancelha", name: "Degradê + Sobrancelha" }, galleryItems, usedIds);
    assert.ok(photo);
    assert.equal(photo.id, "img-2");
  });

  await t.test("retorna null (placeholder individual) se o serviço não tiver foto cadastrada, sem roubar foto de outro corte", () => {
    const usedIds = new Set(["img-1", "img-2", "img-3"]);
    const photo = findGalleryPhoto({ id: "social-sobrancelha", name: "Social + Sobrancelha" }, galleryItems, usedIds);
    assert.equal(photo, null);
  });

  await t.test("serviço sem foto não assume foto de título parcial sem todos os tokens", () => {
    const minimalGallery = [
      { id: "img-only-degrade", title: "Degradê", category: "Cabelo", image_path: "degrade.webp" },
    ];
    // "Degradê + Sobrancelha" não deve pegar "Degradê" simples
    const photo = findGalleryPhoto({ id: "combo", name: "Degradê + Sobrancelha" }, minimalGallery, new Set());
    assert.equal(photo, null);
  });
});

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
