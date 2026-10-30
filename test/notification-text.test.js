const test = require("node:test");
const assert = require("node:assert");
const { texts } = require("../notifications");

test("CDATA is taken literally, without its markers", () => {
  assert.deepStrictEqual(texts("<toast><text><![CDATA[A &lt; B &amp; C]]></text></toast>"), ["A &lt; B &amp; C"]);
});
test("raw comparison characters and markup inside CDATA stay as they are", () => {
  assert.deepStrictEqual(texts("<text><![CDATA[1 < 2 && 3 > 2 <b>bold</b>]]></text>"), ["1 < 2 && 3 > 2 <b>bold</b>"]);
});
test("a closing text tag inside CDATA doesn't end the element", () => {
  assert.deepStrictEqual(texts("<text><![CDATA[a</text>b]]></text><text>next</text>"), ["a</text>b", "next"]);
});
test("ordinary escaped text is decoded", () => {
  assert.deepStrictEqual(texts("<text>A &lt; B &amp; C &gt; D &quot;q&quot; &apos;s&apos;</text>"), [`A < B & C > D "q" 's'`]);
});
test("double escaping is undone only once", () => {
  assert.deepStrictEqual(texts("<text>&amp;lt;</text>"), ["&lt;"]);
});
test("numeric references", () => {
  assert.deepStrictEqual(texts("<text>&#128512; &#x1F600;</text>"), ["😀 😀"]);
  assert.deepStrictEqual(texts("<text>&#xD800; &#1114112; &nope;</text>"), ["&#xD800; &#1114112; &nope;"]);
});
test("text around a CDATA section is decoded, the section isn't", () => {
  assert.deepStrictEqual(texts("<text>x &amp; <![CDATA[&amp;]]> &amp; y</text>"), ["x & &amp; & y"]);
});
test("attribution text is still left out, with either quote", () => {
  assert.deepStrictEqual(texts(`<text>Title</text><text placement="attribution">via App</text><text placement='attribution'><![CDATA[via]]></text><text>Body</text>`), ["Title", "Body"]);
});
test("attributes, empty elements and other tags", () => {
  assert.deepStrictEqual(texts(`<text id="1" hint-maxLines="2">One</text><text/><text></text><text>  </text><textbox>no</textbox><text>Two</text>`), ["One", "Two"]);
});
