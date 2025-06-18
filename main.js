// server.js
import { serveDir } from "jsr:@std/http/file-server";
import kuromoji from "npm:kuromoji";

let previousWord = ["しりとり"];
let hiraganalist = ["しりとり"];
let score = 0;

const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: "./dict" })
    .build((err, tokenizer) => {
      if (err) reject(err);
      else resolve(tokenizer);
    });
});

function katakanaToHiragana(katakana) {
  return katakana.replace(
    /[ァ-ヶ]/g,
    (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

function toHiragana(word, tokenizer) {
  const tokens = tokenizer.tokenize(word);
  let result = "";
  for (const token of tokens) {
    if (token.reading) {
      result += katakanaToHiragana(token.reading);
    } else {
      result += token.surface_form;
    }
  }
  return result;
}

function isKnownWord(word, hiraganaWord, tokenizer) {
  const tokens1 = tokenizer.tokenize(word);
  const kata = hiraganaWord.replace(
    /[ぁ-ゖ]/g,
    (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );
  const tokens2 = tokenizer.tokenize(kata);
  if (
    tokens1.length === 1 &&
    tokens1[0].word_type !== "UNKNOWN" &&
    tokens1[0].surface_form.length === word.length
  ) return true;
  if (
    tokens2.length === 1 &&
    tokens2[0].word_type !== "UNKNOWN" &&
    tokens2[0].surface_form.length === word.length
  ) return true;
  return false;
}

Deno.serve(async (_req) => {
  const pathname = new URL(_req.url).pathname;
  console.log(`pathname: ${pathname}`);

  if (_req.method === "GET" && pathname === "/shiritori") {
    previousWord.splice(0, previousWord.length);
    previousWord.push("しりとり");
    hiraganalist.splice(0, hiraganalist.length);
    hiraganalist.push("しりとり");
    score = 0;
    return new Response(previousWord[0]);
  }

  if (_req.method === "POST" && pathname === "/shiritori") {
    const requestJson = await _req.json();
    const nextWord = requestJson["nextWord"];
    const hiraganaWord = toHiragana(nextWord, tokenizer);

    if (
      hiraganaWord.length < 2 ||
      isKnownWord(nextWord, hiraganaWord, tokenizer) == false
    ) {
      score -= hiraganaWord.length;
      return new Response(
        JSON.stringify({
          errorMessage: "無効な単語か単語が一文字です",
          errorCode: "10003",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        },
      );
    }
    // 小文字（ゃゅょっぁぃぅぇぉ）を考慮
    const smallKana = ["ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "っ"];
    let prevLastChar = hiraganalist[hiraganalist.length - 1].slice(-1)[0];
    let nextFirstChar = hiraganaWord[0];
    if (smallKana.includes(prevLastChar)) {
      prevLastChar = hiraganalist[hiraganalist.length - 1].slice(-2)[0] +
        hiraganalist[hiraganalist.length - 1].slice(-1)[0];
      nextFirstChar += hiraganaWord[1];
    }
    console.log(prevLastChar, nextFirstChar);
    if (prevLastChar === nextFirstChar) {
      if (hiraganaWord.slice(-1) == "ん") {
        previousWord.push(nextWord);
        return new Response(
          JSON.stringify({
            errorMessage: "最後尾が「ん」です",
            errorCode: "10002",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          },
        );
      }

      if (
        previousWord.includes(nextWord) || hiraganalist.includes(hiraganaWord)
      ) {
        previousWord.push(nextWord);
        return new Response(
          JSON.stringify({
            errorMessage: "過去に使用した単語が入力されました",
            errorCode: "10003",
          }),
          {
            status: 402,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          },
        );
      }

      if (hiraganaWord.length > 10) {
        previousWord.push(nextWord + "(すごい！)");
      } else {
        previousWord.push(nextWord);
      }
      score += hiraganaWord.length;
      hiraganalist.push(hiraganaWord);
    } else {
      score -= hiraganaWord.length;
      return new Response(
        JSON.stringify({
          errorMessage: "前の単語に続いていません",
          errorCode: "10001",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        },
      );
    }

    return new Response(previousWord[previousWord.length - 1]);
  }

  if (_req.method === "GET" && pathname === "/score") {
    return new Response(
      JSON.stringify({ score: score, previousWord: previousWord }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }

  return serveDir(_req, {
    fsRoot: "./public/",
    urlRoot: "",
    enableCors: true,
  });
});
