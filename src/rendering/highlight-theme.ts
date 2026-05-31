import chalk from 'chalk';
import { plain, type Theme } from 'cli-highlight';

export const theme: Theme = {
  /**
   * keyword in a regular Algol-style language
   * GitHub Dark: Orange/Red #ff7b72
   */
  keyword: chalk.rgb(255, 123, 114),

  /**
   * built-in or library object (constant, class, function)
   * GitHub Dark: Bright Blue #79c0ff
   */
  built_in: chalk.rgb(121, 192, 255),

  /**
   * user-defined type in a language with first-class syntactically significant types
   * GitHub Dark: Orange #ffa657
   */
  type: chalk.rgb(255, 166, 87),

  /**
   * special identifier for a built-in value ("true", "false", "null")
   * GitHub Dark: Orange/Red #ff7b72
   */
  literal: chalk.rgb(255, 123, 114),

  /**
   * number, including units and modifiers, if any.
   * GitHub Dark: Bright Blue #79c0ff
   */
  number: chalk.rgb(121, 192, 255),

  /**
   * literal regular expression
   * GitHub Dark: Light Blue #a5d6ff
   */
  regexp: chalk.rgb(165, 214, 255),

  /**
   * literal string, character
   * GitHub Dark: Light Blue #a5d6ff
   */
  string: chalk.rgb(165, 214, 255),

  /**
   * parsed section inside a literal string
   */
  subst: plain,

  /**
   * symbolic constant, interned string, goto label
   * GitHub Dark: Bright Blue #79c0ff
   */
  symbol: chalk.rgb(121, 192, 255),

  /**
   * class or class-level declaration (interfaces, traits, modules, etc)
   * GitHub Dark: Orange #ffa657
   */
  class: chalk.rgb(255, 166, 87).bold,

  /**
   * function or method declaration
   * GitHub Dark: Purple #d2a8ff
   */
  function: chalk.rgb(210, 168, 255),

  /**
   * name of a class or a function at the place of declaration
   * GitHub Dark: Purple #d2a8ff
   */
  title: chalk.rgb(210, 168, 255).bold,

  /**
   * block of function arguments (parameters) at the place of declaration
   */
  params: plain,

  /**
   * comment
   * GitHub Dark: Gray #8b949e
   */
  comment: chalk.rgb(139, 148, 158),

  /**
   * documentation markup within comments
   */
  doctag: chalk.rgb(139, 148, 158).bold,

  /**
   * flags, modifiers, annotations, processing instructions, preprocessor directive, etc
   * GitHub Dark: Gray #8b949e
   */
  meta: chalk.rgb(139, 148, 158),

  /**
   * keyword or built-in within meta construct
   */
  'meta-keyword': chalk.rgb(255, 123, 114),

  /**
   * string within meta construct
   */
  'meta-string': chalk.rgb(165, 214, 255),

  /**
   * heading of a section in a config file, heading in text markup
   * GitHub Dark: Bold Blue #79c0ff
   */
  section: chalk.rgb(121, 192, 255).bold,

  /**
   * XML/HTML tag
   * GitHub Dark: Light Green #7ee787
   */
  tag: chalk.rgb(126, 231, 135),

  /**
   * name of an XML tag, the first word in an s-expression
   * GitHub Dark: Light Green #7ee787
   */
  name: chalk.rgb(126, 231, 135),

  /**
   * s-expression name from the language standard library
   */
  'builtin-name': chalk.rgb(210, 168, 255),

  /**
   * name of an attribute with no language defined semantics (keys in JSON, setting names in .ini)
   * GitHub Dark: Bright Blue #79c0ff
   */
  attr: chalk.rgb(121, 192, 255),

  /**
   * name of an attribute followed by a structured value part, like CSS properties
   */
  attribute: chalk.rgb(121, 192, 255),

  /**
   * variable in a config or a template file, environment var expansion in a script
   * GitHub Dark: Main text color #c9d1d9
   */
  variable: chalk.rgb(201, 209, 217),

  /**
   * list item bullet in text markup
   */
  bullet: chalk.rgb(255, 166, 87),

  /**
   * code block in text markup
   */
  code: chalk.rgb(139, 148, 158),

  /**
   * emphasis in text markup
   */
  emphasis: chalk.italic,

  /**
   * strong emphasis in text markup
   */
  strong: chalk.bold,

  /**
   * mathematical formula in text markup
   */
  formula: plain,

  /**
   * hyperlink in text markup
   */
  link: chalk.underline.rgb(165, 214, 255),

  /**
   * quotation in text markup
   */
  quote: chalk.rgb(139, 148, 158),

  /**
   * tag selector in CSS
   */
  'selector-tag': chalk.rgb(126, 231, 135),

  /**
   * #id selector in CSS
   */
  'selector-id': chalk.rgb(210, 168, 255),

  /**
   * .class selector in CSS
   */
  'selector-class': chalk.rgb(255, 166, 87),

  /**
   * [attr] selector in CSS
   */
  'selector-attr': chalk.rgb(121, 192, 255),

  /**
   * :pseudo selector in CSS
   */
  'selector-pseudo': chalk.rgb(210, 168, 255),

  /**
   * tag of a template language
   */
  'template-tag': chalk.rgb(255, 123, 114),

  /**
   * variable in a template language
   */
  'template-variable': chalk.rgb(201, 209, 217),

  /**
   * added or changed line in a diff
   * GitHub Dark Diff: Green #56d364
   */
  addition: chalk.rgb(86, 211, 100),

  /**
   * deleted line in a diff
   * GitHub Dark Diff: Red #f85149
   */
  deletion: chalk.rgb(248, 81, 73),

  /**
   * things not matched by any token
   * GitHub Dark Default Text: #c9d1d9
   */
  default: chalk.rgb(201, 209, 217),
};
