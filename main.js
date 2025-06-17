// server.js
import { serveDir } from "jsr:@std/http/file-server";
import kuromoji from "npm:kuromoji";
// 直前の単語を保持しておく
let previousWord = ["しりとり"];
let hiraganalist = ["しりとり"];
//スコア変数
let score = 0;
// 初期化
const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: "./dict" }) // 辞書フォルダのパス
    .build((err, tokenizer) => {
      if (err) reject(err);
      else resolve(tokenizer);
    });
});
function katakanaToHiragana(katakana) {
  return katakana.replace(
    /[\u30a1-\u30f6]/g,
    (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

// 漢字からひらがな
function toHiragana(word, tokenizer) {
  const tokens = tokenizer.tokenize(word);
  let result = "";
  for (const token of tokens) {
    // 読み（カタカナ）があればひらがなに変換
    if (token.reading) {
      result += katakanaToHiragana(token.reading);
    } else {
      // 読みがない場合はそのまま
      result += token.surface_form;
    }
  }
  console.log(result);
  return result;
}
//単語が実在するかどうか
function isKnownWord(word, hiraganaWord, tokenizer) {
  // トークン化して未知語か判定
  const tokens1 = tokenizer.tokenize(word);
  //ひらがなをカタカナに
  const kata = hiraganaWord.replace(
    /[\u3041-\u3096]/g,
    (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );
  const tokens2 = tokenizer.tokenize(kata);
  console.log(tokens1);
  if (
    tokens1.length === 1 &&
    tokens1[0].word_type !== "UNKNOWN" &&
    tokens1[0].surface_form.length === word.length
  ) {
    return true;
  }
  if (
    tokens2.length === 1 &&
    tokens2[0].word_type !== "UNKNOWN" &&
    tokens2[0].surface_form.length === word.length
  ) {
    return true;
  }

  return false;
}
// localhostにDenoのHTTPサーバーを展開
Deno.serve(async (_req) => {
  // パス名を取得する
  // http://localhost:8000/hoge に接続した場合"/hoge"が取得できる
  const pathname = new URL(_req.url).pathname;
  console.log(`pathname: ${pathname}`);

  // GET /shiritori: 直前の単語を返す
  if (_req.method === "GET" && pathname === "/shiritori") {
    previousWord.splice(0, previousWord.length);
    previousWord.push("しりとり");
    hiraganalist.splice(0, hiraganalist.length);
    hiraganalist.push("しりとり");
    score = 0;
    return new Response(previousWord[0]);
  }

  // POST /shiritori: 次の単語を受け取って保存する
  if (_req.method === "POST" && pathname === "/shiritori") {
    // リクエストのペイロードを取得
    const requestJson = await _req.json();
    // JSONの中からnextWordを取得
    const nextWord = requestJson["nextWord"];
    const hiraganaWord = toHiragana(nextWord, tokenizer);
    if (
      hiraganaWord.length < 2 ||
      isKnownWord(nextWord, hiraganaWord, tokenizer) == false
    ) {
      score -= hiraganaWord.length;
      return new Response(
        JSON.stringify({
          "errorMessage": "無効な単語か単語が一文字です",
          "errorCode": "10003",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        },
      );
    }
    // previousWordの末尾とnextWordの先頭が同一か確認
    if (
      hiraganalist[hiraganalist.length - 1].slice(-1) ===
        hiraganaWord.slice(0, 1)
    ) {
      // 同一であれば、previousWordを更新
      if (hiraganaWord.slice(-1) == "ん") {
        previousWord.push(nextWord);
        return new Response(
          JSON.stringify({
            "errorMessage": "最後尾が「ん」です",
            "errorCode": "10002",
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
            "errorMessage": "過去に使用した単語が入力されました",
            "errorCode": "10003",
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
    } // 同一でない単語の入力時に、エラーを返す
    else {
      score -= hiraganaWord.length;
      return new Response(
        JSON.stringify({
          "errorMessage": "前の単語に続いていません",
          "errorCode": "10001",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        },
      );
    }

    // 現在の単語を返す
    return new Response(previousWord[previousWord.length - 1]);
  }
  if (_req.method === "GET" && pathname === "/score") {
    return new Response(
      JSON.stringify({
        "score": score,
        "previousWord": previousWord,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }

  // ./public以下のファイルを公開
  return serveDir(
    _req,
    {
      /*
            - fsRoot: 公開するフォルダを指定
            - urlRoot: フォルダを展開するURLを指定。今回はlocalhost:8000/に直に展開する
            - enableCors: CORSの設定を付加するか
            */
      fsRoot: "./public/",
      urlRoot: "",
      enableCors: true,
    },
  );
});
