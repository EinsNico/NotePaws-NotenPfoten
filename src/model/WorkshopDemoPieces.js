import laCandeurMusicXml from "../resources/demo-pieces/la-candeur.musicxml.json";
import { importWorkshopMusicXml } from "./WorkshopMusicXml";

export const WORKSHOP_DEMO_PIECES = Object.freeze([
  Object.freeze({
    id: "la-candeur-op-100-no-1",
    title: "La Candeur (Tenderness), Op. 100 Nr. 1",
    composer: "Friedrich Burgmüller (1806–1874)"
  })
]);

const LA_CANDEUR_METADATA = {
  copyright: "Das Stück bzw. die zugrunde liegende Mutopia-Vorlage ist im Mutopia Project als „Public Domain“ gekennzeichnet. Die MusicXML-Datei wird von Pianodemy als aus der Mutopia-MIDI-Datei erstellt beschrieben. Dieser Hinweis bezieht sich auf das Stück und die genannte Vorlage, nicht auf die App oder deren Programmcode.",
  license: "Public Domain (gemeinfrei laut Mutopia Project)",
  sources: [
    { label: "Mutopia Project – La Candeur, Mutopia-ID 202", url: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=202" },
    { label: "Pianodemy – Stück- und Dateiquelle", url: "https://pianodemy.com/pieces/burgmuller-tenderness-op-100-no-1/" },
    { label: "MusicXML-Datei", url: "https://pianodemy.com/pieces/burgmuller-tenderness-op-100-no-1/burgmuller-tenderness-op-100-no-1.musicxml" }
  ]
};

// The library installer uses this factory once. The resulting saved piece has
// the same editable score and user-generated ID as every other library piece.
export async function createWorkshopDemoDraft(id) {
  const demo = WORKSHOP_DEMO_PIECES.find(piece => piece.id === id);
  if (!demo) throw new Error("unknown-workshop-demo");
  const imported = await importWorkshopMusicXml(laCandeurMusicXml, { filename: "la-candeur.musicxml" });
  imported.score.metadata = Object.assign({}, imported.score.metadata, {
    title: demo.title,
    composer: demo.composer,
    copyright: LA_CANDEUR_METADATA.copyright,
    license: LA_CANDEUR_METADATA.license,
    sources: LA_CANDEUR_METADATA.sources.map(source => Object.assign({}, source))
  });
  if (imported.score.metadata.subtitle === "Music21 Fragment") delete imported.score.metadata.subtitle;
  return { pieceId: null, title: demo.title, score: imported.score };
}

// A previous user-saved copy may already contain the packaged score. Match the
// exact embedded source, including older revisions, rather than claiming an
// unrelated piece merely because the user chose the same title.
export function isWorkshopDemoPiece(piece, demoId) {
  if (demoId !== "la-candeur-op-100-no-1" || !piece || !Array.isArray(piece.revisions)) return false;
  return piece.revisions.some(revision => revision.score && revision.score.musicXml
    && revision.score.musicXml.sourceXml === laCandeurMusicXml);
}
