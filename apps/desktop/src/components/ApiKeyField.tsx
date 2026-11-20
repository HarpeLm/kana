import { useState } from "react";

interface ApiKeyFieldProps {
  variable: string;
  hasKey: boolean;
  onSave: (key: string) => void;
  onRemove: () => void;
}

export default function ApiKeyField({ variable, hasKey, onSave, onRemove }: ApiKeyFieldProps) {
  const [key, setKey] = useState("");

  if (hasKey) {
    return (
      <div className="flex items-center justify-between text-[12px] text-[#9a9992]">
        <span>Clé d'API enregistrée dans le Trousseau ({variable})</span>
        <button onClick={onRemove} className="text-[#e69b80] hover:text-[#f0b49e]">
          Supprimer
        </button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={`key-${variable}`} className="mb-1 block text-[12px] text-[#9a9992]">
        Clé d'API (facultatif) · {variable}
      </label>
      <div className="flex gap-2">
        <input
          id={`key-${variable}`}
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Colle ta clé ici"
          className="flex-1 rounded-lg border border-[#343430] bg-[#1d1d1b] px-3 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#6c6b65] outline-none focus:border-[#4a4a44]"
        />
        <button
          disabled={!key.trim()}
          onClick={() => {
            onSave(key);
            setKey("");
          }}
          className="rounded-lg bg-[#2e2e2b] px-3 py-1.5 text-[12px] font-medium text-[#e6e5df] transition hover:bg-[#383835] disabled:opacity-40"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}
