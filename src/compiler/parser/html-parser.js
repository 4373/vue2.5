/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'

// Regular Expressions for parsing tags and attributes
// 属性匹配
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// could use https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName
// but for Vue templates we can enforce a simple charset
const ncname = '[a-zA-Z_][\\w\\-\\.]*'
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
// 开始标签 类似: <标签名
const startTagOpen = new RegExp(`^<${qnameCapture}`)
// /> 或 >
const startTagClose = /^\s*(\/?)>/
// 结束标签
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i // 匹配 <!DOCTYPE html>
const comment = /^<!--/ // 匹配注释
const conditionalComment = /^<!\[/ // 匹配 类似 <![if !IE]>

let IS_REGEX_CAPTURING_BROKEN = false
'x'.replace(/x(.)?/g, function (m, g) {
  IS_REGEX_CAPTURING_BROKEN = g === ''
})

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n'
}
const encodedAttr = /&(?:lt|gt|quot|amp);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#10);/g

// #5992
// 是否是忽视新行的标签
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

// 解码属性 比如 传入的value 为  `&lt;div>&lt;/div>` 返回值将为 `<div></div>`
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export function parseHTML (html, options) {
  // 元素匹配闭合栈
  const stack = []
  const expectHTML = options.expectHTML
  // 是否为一元标签
  const isUnaryTag = options.isUnaryTag || no
  // 是否和自闭和的非一元标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  // 读取html字符串的位子，向前移动
  let index = 0
  // last: 剩余的未解析的html； lastTag: stack 栈顶的元素
  let last, lastTag
  // 当html 不为空时， 逐步解析
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script,style,textarea
    // 确保我们不在脚本/样式等纯文本内容元素中
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // 第一个 < 出现的位置
      let textEnd = html.indexOf('<')
      // 如果位置为0
      if (textEnd === 0) {
        // Comment:
        if (comment.test(html)) { // 如果是注释
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            // 如果保留注释， 将注释提取出来传入 options.comment方法
            if (options.shouldKeepComment) {
              options.comment(html.substring(4, commentEnd))
            }
            // 向前推进
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) { // 如果类似 <![if !IE]> 
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        const endTagMatch = html.match(endTag)
        if (endTagMatch) { // 如果是结束标签
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }
        // 如果既不是 注释， 结束标签， Doctype等， 那就是开始标签
        // Start tag:
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(lastTag, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      if (textEnd >= 0) {
        rest = html.slice(textEnd)
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd)
        advance(textEnd)
      }

      if (textEnd < 0) {
        text = html
        html = ''
      }

      if (options.chars && text) {
        options.chars(text)
      }
    } else { // 如果 在 script,style,textarea 标签里面
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!--([\s\S]*?)-->/g, '$1')
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }
    // 如果html 没有做任何解析，html为 纯文本
    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`)
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  // 推进， 每次解析玩元素 更新index 和 html
  function advance (n) {
    index += n
    html = html.substring(n)
  }

  /**
   * 处理 <div someattr='someattrvalue'> sdfs sdf</div> 中的  <div someattr='someattrvalue'>
   * return match = {
   *    tagName: 'div'
   *    attrs: [
   *      ['someattr', '=', 'someattvalue', undefined, undefined]
   *    ]
   * }
   */
  function parseStartTag () {
    // 匹配 开始标签open 标志 <
    const start = html.match(startTagOpen)
    if (start) {
      //  开始标签 将会被转化为以下形式， 后续会加上 unarySlash 和 end 属性
      const match = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      advance(start[0].length)
      //end： 开始标签结束标志 > ;  attr： 标签属性
      let end, attr
      // 如果当前的html 没有匹配到结束标志并且 有匹配到属性
      while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
        // 处理属性 ， html和 index 向前推进
        advance(attr[0].length)
        match.attrs.push(attr)
      }
      // 处理开头标签结束
      if (end) {
        // 如果end[1] 不为undefined 该标签是一元标签
        match.unarySlash = end[1]
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }
  // 处理开始标签
  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      // 如果解析的是 p标签 并且 不是段落式内容模型 Phrasing content
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }
    // 是否一元标签 标准的一元标签   或者  自定义组件自闭合
    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    // 将属性转化为 [{name:value}]形式
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      // hackish work around FF bug https://bugzilla.mozilla.org/show_bug.cgi?id=369778
      // 没有具体看这个hack，应该是解决一个String.match方法的bug
      if (IS_REGEX_CAPTURING_BROKEN && args[0].indexOf('""') === -1) {
        if (args[3] === '') { delete args[3] }
        if (args[4] === '') { delete args[4] }
        if (args[5] === '') { delete args[5] }
      }
      const value = args[3] || args[4] || args[5] || ''
      attrs[i] = {
        name: args[1],
        value: decodeAttr(
          value,
          options.shouldDecodeNewlines
        )
      }
    }
    // 如果是非自闭合标签 则将该开始标签 push 入 stack， 标签名赋值给 lastTag， 一遍形成匹配
    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs })
      lastTag = tagName
    }
    // 如果声明了 start 方法， 传入
    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }
  //
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
    }

    // Find the closest opened tag of the same type
    // 查找stack中最近的 标签类型
    if (tagName) {
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) { //
      // Close all the open elements, up the stack
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`
          )
        }
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
